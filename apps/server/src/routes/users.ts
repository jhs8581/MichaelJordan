import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth';
import { prisma } from '../lib/prisma';

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  // ── 전체 사용자 목록 (채팅 상대 선택용) ──────────────────────
  app.get('/', async (req, reply) => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        isOnline: true,
        createdAt: true,
      },
      orderBy: { username: 'asc' },
    });
    return reply.send({ success: true, data: users });
  });
}
