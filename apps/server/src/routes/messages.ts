import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth';
import { prisma } from '../lib/prisma';

const PAGE_SIZE = 50;

export async function messageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  // ── 메시지 목록 (무한 스크롤: cursor 기반) ─────────────────────
  app.get('/:roomId', async (req, reply) => {
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
}
