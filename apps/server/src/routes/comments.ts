import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const createSchema = z.object({
  postId: z.number().int().positive(),
  content: z.string().min(1).max(2000),
});

const updateSchema = z.object({
  content: z.string().min(1).max(2000),
});

const commentInclude = {
  author: { select: { id: true, username: true, avatarUrl: true } },
} as const;

export async function commentRoutes(app: FastifyInstance) {
  // 인증 필요
  app.addHook('onRequest', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: '인증 필요' });
    }
  });

  // 댓글 목록 조회
  app.get('/', async (req, reply) => {
    const { postId } = req.query as { postId?: string };
    if (!postId || isNaN(Number(postId))) {
      return reply.status(400).send({ error: 'postId가 필요합니다' });
    }

    const pid = Number(postId);
    
    // 게시글 존재 여부 및 권한 확인
    const post = await prisma.post.findUnique({ where: { id: pid }, include: { room: true } });
    if (!post) return reply.status(404).send({ error: '게시글을 찾을 수 없습니다' });

    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);
    const member = await prisma.roomMember.findUnique({ 
      where: { userId_roomId: { userId, roomId: post.roomId } } 
    });
    if (!member) return reply.status(403).send({ error: '채팅방 멤버가 아닙니다' });

    const comments = await prisma.comment.findMany({
      where: { postId: pid },
      orderBy: { createdAt: 'asc' },
      include: commentInclude,
    });

    return reply.send({ success: true, data: { comments } });
  });

  // 댓글 작성
  app.post('/', async (req, reply) => {
    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);

    const body = createSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: '입력값 오류', details: body.error.flatten() });

    const { postId, content } = body.data;

    // 게시글 존재 여부 및 권한 확인
    const post = await prisma.post.findUnique({ where: { id: postId }, include: { room: true } });
    if (!post) return reply.status(404).send({ error: '게시글을 찾을 수 없습니다' });

    const member = await prisma.roomMember.findUnique({ 
      where: { userId_roomId: { userId, roomId: post.roomId } } 
    });
    if (!member) return reply.status(403).send({ error: '채팅방 멤버가 아닙니다' });

    const comment = await prisma.comment.create({
      data: {
        postId,
        content: content.trim(),
        authorId: userId,
      },
      include: commentInclude,
    });

    return reply.status(201).send({ success: true, data: { comment } });
  });

  // 댓글 수정
  app.patch('/:id', async (req, reply) => {
    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);
    const commentId = Number((req.params as { id: string }).id);

    const existing = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!existing) return reply.status(404).send({ error: '댓글을 찾을 수 없습니다' });
    if (existing.authorId !== userId) return reply.status(403).send({ error: '권한 없음' });

    const body = updateSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: '입력값 오류' });

    const comment = await prisma.comment.update({ 
      where: { id: commentId }, 
      data: { content: body.data.content.trim() },
      include: commentInclude,
    });

    return reply.send({ success: true, data: { comment } });
  });

  // 댓글 삭제
  app.delete('/:id', async (req, reply) => {
    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);
    const commentId = Number((req.params as { id: string }).id);

    const existing = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!existing) return reply.status(404).send({ error: '댓글을 찾을 수 없습니다' });
    if (existing.authorId !== userId) return reply.status(403).send({ error: '권한 없음' });

    await prisma.comment.delete({ where: { id: commentId } });
    return reply.send({ success: true });
  });
}
