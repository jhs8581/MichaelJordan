import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth';
import { prisma } from '../lib/prisma';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs';
import path from 'node:path';

const PAGE_SIZE = 50;
const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov', '.m4v']);
const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4',
};

export async function messageRoutes(app: FastifyInstance) {
  // ── 정적 이미지 서빙 (인증 불필요) ─────────────────────────────
  // app 스코프 직접 등록: addHook은 아래 자식 스코프에만 있으므로 여기엔 인증 없음
  app.get('/file/:filename', async (req, reply) => {
    const { filename } = req.params as { filename: string };
    // 경로 순회 방지
    if (!/^[a-zA-Z0-9_\-]+\.[a-zA-Z]{2,5}$/.test(filename)) {
      return reply.status(400).send({ error: 'Invalid filename' });
    }
    const filePath = path.join(process.cwd(), 'uploads', filename);
    try {
      const ext = path.extname(filename).toLowerCase();
      reply.type(EXT_MIME[ext] ?? 'application/octet-stream');
      return reply.send(fs.createReadStream(filePath));
    } catch {
      return reply.status(404).send({ error: 'File not found' });
    }
  });

  // ── 이하 모든 인증 필요 라우트를 별도 자식 스코프에 격리 ─────
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
    const { cursor } = req.query as { cursor?: string };

    // 해당 방 멤버인지 검증
    const member = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId: Number(roomId) } },
    });
    if (!member) {
      return reply.status(403).send({ success: false, error: '접근 권한이 없습니다.' });
    }

    const messages = await prisma.message.findMany({
      where: {
        roomId: Number(roomId),
        ...(cursor ? { id: { lt: Number(cursor) } } : {}),
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        reads: { select: { userId: true, readAt: true } },
      },
      orderBy: { id: 'desc' },
      take: PAGE_SIZE,
    });

    const nextCursor = messages.length === PAGE_SIZE ? messages[messages.length - 1].id : null;

    return reply.send({
      success: true,
      data: { messages: messages.reverse(), nextCursor },
    });
  });

  // ── 메시지 검색 ──────────────────────────────────────────────
  auth.get('/:roomId/search', async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;
    const { roomId } = req.params as { roomId: string };
    const { keyword, date } = req.query as { keyword?: string; date?: string };

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

    const messages = await prisma.message.findMany({
      where: {
        roomId: Number(roomId),
        ...(keyword?.trim() ? { content: { contains: keyword.trim() } } : {}),
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        reads: { select: { userId: true, readAt: true } },
      },
      orderBy: { id: 'asc' },
      take: 100,
    });

    return reply.send({ success: true, data: { messages } });
  });
  }); // ── end auth scope
}
