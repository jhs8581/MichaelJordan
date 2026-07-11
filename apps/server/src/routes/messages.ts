import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth';
import { prisma } from '../lib/prisma';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs';
import path from 'node:path';
import { emitMessageUpdated } from '../lib/chat-io';
import { editMessageContent } from '../lib/message-edit';

const PAGE_SIZE = 50;

// ── Link preview helpers ──────────────────────────────────────
interface LinkPreviewData { title: string; description?: string; url: string; }
const previewCache = new Map<string, { data: LinkPreviewData | null; expires: number }>();
const PREVIEW_TTL = 3_600_000;

function isPrivateHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    hostname === '::1' ||
    hostname === '0.0.0.0'
  );
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function extractMeta(html: string, propKey: string, attrName = 'property'): string | undefined {
  const pats = [
    new RegExp(`<meta[^>]+${attrName}=["']${propKey}["'][^>]+content=["']([^"'<>]{1,300})["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"'<>]{1,300})["'][^>]+${attrName}=["']${propKey}["']`, 'i'),
  ];
  for (const re of pats) {
    const m = re.exec(html);
    if (m?.[1]) return decodeHtmlEntities(m[1].trim());
  }
  return undefined;
}
const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov', '.m4v']);
const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4',
};

export async function messageRoutes(app: FastifyInstance) {
  // ── 이하 모든 인증 필요 라우트를 별도 자식 스코프에 격리 ─────
  // 파일 서빙(/file/:filename)은 index.ts 루트 레벨에서 직접 등록됨 (인증 우회 보장)
  // 핵심: app (부모) 에 addHook 하면 /file 라우트에도 적용됨.
  // 자식 스코프에서만 addHook 하면 해당 스코프 라우트에만 인증 적용.
  await app.register(async (auth) => {
    auth.addHook('preHandler', requireAuth);

  // ── 이미지 업로드 ─────────────────────────────────────────────
  auth.post('/upload', async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;
    const data = await req.file();
    if (!data) return reply.status(400).send({ success: false, error: 'No file' });

    const ext = path.extname(data.filename).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      return reply.status(400).send({ success: false, error: '이미지 또는 동영상 파일만 업로드 가능합니다' });
    }

    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const uniqueName = `${Date.now()}-${userId}${ext}`;
    await pipeline(data.file, fs.createWriteStream(path.join(uploadDir, uniqueName)));

    const baseUrl = process.env.BASE_URL ?? 'https://15.164.117.143.nip.io';
    return reply.send({ success: true, data: { url: `${baseUrl}/api/messages/file/${uniqueName}` } });
  });

  // ── 메시지 목록 (무한 스크롤: cursor 기반) ─────────────────────
  auth.get('/:roomId', async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;
    const { roomId } = req.params as { roomId: string };
    const { cursor, around, afterCursor } = req.query as { cursor?: string; around?: string; afterCursor?: string };

    // 해당 방 멤버인지 검증
    const member = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId: Number(roomId) } },
    });
    if (!member) {
      return reply.status(403).send({ success: false, error: '접근 권한이 없습니다.' });
    }

    const messageInclude = {
      sender: { select: { id: true, username: true, avatarUrl: true } },
      reads: { select: { userId: true, readAt: true } },
      replyTo: {
        select: {
          id: true,
          senderId: true,
          content: true,
          fileUrl: true,
          senderTimeZone: true,
          senderLocalTime: true,
          createdAt: true,
          sender: { select: { id: true, username: true, avatarUrl: true } },
        },
      },
    };

    // 특정 메시지 주변 로드 (검색 결과 이동)
    if (around) {
      const aroundId = Number(around);
      const BEFORE = 30;
      const AFTER = 20;

      const [before, after] = await Promise.all([
        prisma.message.findMany({
          where: { roomId: Number(roomId), id: { lte: aroundId } },
          include: messageInclude,
          orderBy: { id: 'desc' },
          take: BEFORE,
        }),
        prisma.message.findMany({
          where: { roomId: Number(roomId), id: { gt: aroundId } },
          include: messageInclude,
          orderBy: { id: 'asc' },
          take: AFTER,
        }),
      ]);

      const combined = [...before.reverse(), ...after];
      const nextCursor = before.length === BEFORE ? before[before.length - 1].id : null;
      const newerCursor = after.length === AFTER ? after[after.length - 1].id : null;

      return reply.send({ success: true, data: { messages: combined, nextCursor, newerCursor } });
    }

    if (afterCursor) {
      const messages = await prisma.message.findMany({
        where: {
          roomId: Number(roomId),
          id: { gt: Number(afterCursor) },
        },
        include: messageInclude,
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
      });

      const newerCursor = messages.length === PAGE_SIZE ? messages[messages.length - 1].id : null;

      return reply.send({
        success: true,
        data: { messages, nextCursor: null, newerCursor },
      });
    }

    const messages = await prisma.message.findMany({
      where: {
        roomId: Number(roomId),
        ...(cursor ? { id: { lt: Number(cursor) } } : {}),
      },
      include: messageInclude,
      orderBy: { id: 'desc' },
      take: PAGE_SIZE,
    });

    const nextCursor = messages.length === PAGE_SIZE ? messages[messages.length - 1].id : null;

    return reply.send({
      success: true,
      data: { messages: messages.reverse(), nextCursor, newerCursor: null },
    });
  });

  auth.patch('/:messageId', async (req, reply) => {
    const userId = Number((req.user as { sub: number | string }).sub);
    const { messageId } = req.params as { messageId: string };
    const body = req.body as { content?: string } | null | undefined;
    const content = body?.content;

    const result = await editMessageContent({
      messageId: Number(messageId),
      userId,
      content: content ?? '',
    });

    if (!result.ok) {
      if (result.error === 'EMPTY_CONTENT') {
        return reply.status(400).send({ success: false, error: '메시지 내용이 필요합니다.' });
      }
      if (result.error === 'NOT_FOUND') {
        return reply.status(404).send({ success: false, error: '메시지를 찾을 수 없습니다.' });
      }
      if (result.error === 'FORBIDDEN') {
        return reply.status(403).send({ success: false, error: '수정 권한이 없습니다.' });
      }
      return reply.status(500).send({ success: false, error: '메시지 수정 중 오류가 발생했습니다.' });
    }

    emitMessageUpdated(result.data);
    return reply.send({ success: true, data: result.data });
  });

  // ── 메시지 검색 ──────────────────────────────────────────────
  auth.get('/:roomId/search', async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;
    const { roomId } = req.params as { roomId: string };
    const { keyword, date, firstOnly } = req.query as { keyword?: string; date?: string; firstOnly?: string };

    const member = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId: Number(roomId) } },
    });
    if (!member) {
      return reply.status(403).send({ success: false, error: '접근 권한이 없습니다.' });
    }

    // 날짜 필터: date = 'YYYY-MM-DD'
    let dateFilter: { gte?: Date; lt?: Date } | undefined;
    if (date) {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        dateFilter = { gte: d, lt: next };
      }
    }

    const messageInclude = {
      sender: { select: { id: true, username: true, avatarUrl: true } },
      reads: { select: { userId: true, readAt: true } },
      replyTo: {
        select: {
          id: true,
          senderId: true,
          content: true,
          fileUrl: true,
          senderTimeZone: true,
          senderLocalTime: true,
          createdAt: true,
          sender: { select: { id: true, username: true, avatarUrl: true } },
        },
      },
    };

    const trimmedKeyword = keyword?.trim();
    const shouldReturnFirstOnly = firstOnly === '1' && !trimmedKeyword && Boolean(dateFilter);

    if (shouldReturnFirstOnly) {
      const firstMessage = await prisma.message.findFirst({
        where: {
          roomId: Number(roomId),
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
        include: messageInclude,
        orderBy: { id: 'asc' },
      });

      return reply.send({ success: true, data: { messages: firstMessage ? [firstMessage] : [] } });
    }

    const messages = await prisma.message.findMany({
      where: {
        roomId: Number(roomId),
        ...(trimmedKeyword ? { content: { contains: trimmedKeyword } } : {}),
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      include: messageInclude,
      orderBy: { id: 'asc' },
      take: 100,
    });

    return reply.send({ success: true, data: { messages } });
  });

  // ── 채팅방 이미지 목록 전체 조회 ─────────────────────────────
  auth.get('/:roomId/images', async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;
    const { roomId } = req.params as { roomId: string };

    const member = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId: Number(roomId) } },
    });
    if (!member) return reply.status(403).send({ success: false, error: '접근 권한이 없습니다.' });

    const msgs = await prisma.message.findMany({
      where: { roomId: Number(roomId), fileUrl: { not: null } },
      select: { fileUrl: true, createdAt: true },
      orderBy: { id: 'desc' },
    });

    const imageItems = msgs
      .filter((m) => m.fileUrl && !/\.(mp4|webm|mov|m4v|avi)(\?.*)?$/i.test(m.fileUrl))
      .map((m) => ({ url: m.fileUrl!, createdAt: m.createdAt }));
    const images = imageItems.map((item) => item.url);

    return reply.send({ success: true, data: { images, imageItems } });
  });

  // ── 채팅방 동영상 목록 전체 조회 ─────────────────────────────
  auth.get('/:roomId/videos', async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;
    const { roomId } = req.params as { roomId: string };

    const member = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId: Number(roomId) } },
    });
    if (!member) return reply.status(403).send({ success: false, error: '접근 권한이 없습니다.' });

    const msgs = await prisma.message.findMany({
      where: { roomId: Number(roomId), fileUrl: { not: null } },
      select: { fileUrl: true, createdAt: true },
      orderBy: { id: 'desc' },
    });

    const videoItems = msgs
      .filter((m) => m.fileUrl && /\.(mp4|webm|mov|m4v|avi)(\?.*)?$/i.test(m.fileUrl))
      .map((m) => ({ url: m.fileUrl!, createdAt: m.createdAt }));

    return reply.send({ success: true, data: { videoItems } });
  });

  // ── 채팅방 링크 목록 전체 조회 ───────────────────────────────
  auth.get('/:roomId/links', async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;
    const { roomId } = req.params as { roomId: string };

    const member = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId: Number(roomId) } },
    });
    if (!member) return reply.status(403).send({ success: false, error: '접근 권한이 없습니다.' });

    const msgs = await prisma.message.findMany({
      where: { roomId: Number(roomId), content: { contains: 'http' } },
      select: {
        id: true, content: true, createdAt: true, senderId: true,
        sender: { select: { id: true, username: true } },
      },
      orderBy: { id: 'desc' },
      take: 300,
    });

    const urlRegex = /https?:\/\/[^\s<]+/g;
    const links: Array<{ url: string; messageId: number; sender: { id: number; username: string } | null; createdAt: Date }> = [];

    for (const msg of msgs) {
      if (!msg.content) continue;
      const matches = msg.content.match(urlRegex);
      if (!matches) continue;
      for (const url of matches) {
        links.push({ url, messageId: msg.id, sender: msg.sender, createdAt: msg.createdAt });
      }
    }

    return reply.send({ success: true, data: { links } });
  });

  // ── 링크 미리보기 ─────────────────────────────────────────────
  auth.get('/link-preview', async (req, reply) => {
    const { url } = req.query as { url?: string };
    if (!url) return reply.send({ success: false });

    let parsed: URL;
    try { parsed = new URL(url); } catch { return reply.send({ success: false }); }
    if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateHost(parsed.hostname)) {
      return reply.send({ success: false });
    }

    const cached = previewCache.get(url);
    if (cached && cached.expires > Date.now()) {
      return reply.send({ success: !!cached.data, ...(cached.data ? { data: cached.data } : {}) });
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'facebookexternalhit/1.1', Accept: 'text/html' },
        redirect: 'follow',
      });
      clearTimeout(timer);

      const ct = res.headers.get('content-type') ?? '';
      if (!res.ok || !ct.includes('text/html')) {
        previewCache.set(url, { data: null, expires: Date.now() + PREVIEW_TTL });
        return reply.send({ success: false });
      }

      let html = '';
      const reader = res.body?.getReader();
      if (reader) {
        let bytes = 0;
        const dec = new TextDecoder();
        while (bytes < 100_000) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          html += dec.decode(value, { stream: true });
          bytes += value.length;
        }
        reader.cancel().catch(() => {});
      }

      const title =
        extractMeta(html, 'og:title') ??
        (() => { const m = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html); return m ? decodeHtmlEntities(m[1].trim()) : undefined; })();

      if (!title) {
        previewCache.set(url, { data: null, expires: Date.now() + PREVIEW_TTL });
        return reply.send({ success: false });
      }

      const description = extractMeta(html, 'og:description') ?? extractMeta(html, 'description', 'name');
      const data: LinkPreviewData = { title, description, url };
      previewCache.set(url, { data, expires: Date.now() + PREVIEW_TTL });
      return reply.send({ success: true, data });
    } catch {
      previewCache.set(url, { data: null, expires: Date.now() + PREVIEW_TTL });
      return reply.send({ success: false });
    }
  });

  }); // ── end auth scope
}
