import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const createSchema = z.object({
  roomId: z.number().int().positive(),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  sourceMessageId: z.number().int().positive().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(10000).optional(),
});

const postInclude = {
  author: { select: { id: true, username: true, avatarUrl: true } },
  sourceMessage: {
    select: { id: true, content: true, createdAt: true, sender: { select: { id: true, username: true } } },
  },
} as const;

export async function postRoutes(app: FastifyInstance) {
  // 인증 필요
  app.addHook('onRequest', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: '인증 필요' });
    }
  });

  // 게시글 목록 조회
  app.get('/', async (req, reply) => {
    const { cursor, limit = 20, roomId } = req.query as { cursor?: string; limit?: number; roomId?: string };
    if (!roomId || isNaN(Number(roomId))) {
      return reply.status(400).send({ error: 'roomId가 필요합니다' });
    }
    const rid = Number(roomId);
    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);
    const member = await prisma.roomMember.findUnique({ where: { userId_roomId: { userId, roomId: rid } } });
    if (!member) return reply.status(403).send({ error: '채팅방 멤버가 아닙니다' });

    const take = Math.min(Number(limit), 50);

    const posts = await prisma.post.findMany({
      where: { roomId: rid },
      take: take + 1,
      ...(cursor ? { skip: 1, cursor: { id: Number(cursor) } } : {}),
      orderBy: { createdAt: 'desc' },
      include: postInclude,
    });

    const hasMore = posts.length > take;
    if (hasMore) posts.pop();
    const nextCursor = hasMore ? posts[posts.length - 1]?.id : null;

    return reply.send({ success: true, data: { posts, nextCursor } });
  });

  // 게시글 상세 조회
  app.get('/:id', async (req, reply) => {
    const postId = Number((req.params as { id: string }).id);
    const post = await prisma.post.findUnique({ where: { id: postId }, include: postInclude });
    if (!post) return reply.status(404).send({ error: '게시글을 찾을 수 없습니다' });
    return reply.send({ success: true, data: { post } });
  });

  // 게시글 작성
  app.post('/', async (req, reply) => {
    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);

    const body = createSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: '입력값 오류', details: body.error.flatten() });

    const { roomId, title, content, sourceMessageId } = body.data;

    // 채팅방 멤버 검증
    const member = await prisma.roomMember.findUnique({ where: { userId_roomId: { userId, roomId } } });
    if (!member) return reply.status(403).send({ error: '채팅방 멤버가 아닙니다' });

    // sourceMessageId 검증
    if (sourceMessageId) {
      const msg = await prisma.message.findUnique({ where: { id: sourceMessageId } });
      if (!msg) return reply.status(404).send({ error: '원본 메시지를 찾을 수 없습니다' });
    }

    const post = await prisma.post.create({
      data: {
        roomId,
        title: title.trim(),
        content: content.trim(),
        authorId: userId,
        sourceMessageId: sourceMessageId ?? null,
      },
      include: postInclude,
    });
    return reply.status(201).send({ success: true, data: { post } });
  });

  // 게시글 수정
  app.patch('/:id', async (req, reply) => {
    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);
    const postId = Number((req.params as { id: string }).id);

    const existing = await prisma.post.findUnique({ where: { id: postId } });
    if (!existing) return reply.status(404).send({ error: '게시글을 찾을 수 없습니다' });
    if (existing.authorId !== userId) return reply.status(403).send({ error: '권한 없음' });

    const body = updateSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: '입력값 오류' });

    const data: Record<string, string> = {};
    if (body.data.title !== undefined) data.title = body.data.title.trim();
    if (body.data.content !== undefined) data.content = body.data.content.trim();

    const post = await prisma.post.update({ where: { id: postId }, data, include: postInclude });
    return reply.send({ success: true, data: { post } });
  });

  // 게시글 삭제
  app.delete('/:id', async (req, reply) => {
    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);
    const postId = Number((req.params as { id: string }).id);

    const existing = await prisma.post.findUnique({ where: { id: postId } });
    if (!existing) return reply.status(404).send({ error: '게시글을 찾을 수 없습니다' });
    if (existing.authorId !== userId) return reply.status(403).send({ error: '권한 없음' });

    await prisma.post.delete({ where: { id: postId } });
    return reply.send({ success: true });
  });
}
