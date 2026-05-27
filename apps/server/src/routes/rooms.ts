import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  isGroup: z.boolean().default(false),
  memberIds: z.array(z.number()).min(1),
});

export async function roomRoutes(app: FastifyInstance) {
  // 인증 필요
  app.addHook('preHandler', requireAuth);

  // ── 내 채팅방 목록 ─────────────────────────────────────────────
  app.get('/', async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;

    const rooms = await prisma.room.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: { include: { user: { select: { id: true, username: true, avatarUrl: true, isOnline: true } } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, content: true, createdAt: true, senderId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // isMuted: 현재 유저의 뮤트 여부를 각 방에 주입
    const memberMap = await prisma.roomMember.findMany({
      where: { userId, roomId: { in: rooms.map((r) => r.id) } },
      select: { roomId: true, isMuted: true },
    });
    const muteByRoom = Object.fromEntries(memberMap.map((m) => [m.roomId, m.isMuted]));
    const roomsWithMute = rooms.map((r) => ({ ...r, isMuted: muteByRoom[r.id] ?? false }));

    return reply.send({ success: true, data: roomsWithMute });
  });

  // ── 채팅방 생성 ────────────────────────────────────────────────
  app.post('/', async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;
    const body = createRoomSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: body.error.message });
    }

    const { name, isGroup, memberIds } = body.data;
    const allMemberIds = Array.from(new Set([userId, ...memberIds]));

    const room = await prisma.room.create({
      data: {
        name,
        isGroup,
        members: {
          create: allMemberIds.map((id) => ({ userId: id })),
        },
      },
      include: {
        members: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } },
      },
    });

    return reply.status(201).send({ success: true, data: room });
  });

  // ── 채팅방 상세 ────────────────────────────────────────────────
  app.get('/:roomId', async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;
    const { roomId } = req.params as { roomId: string };

    const room = await prisma.room.findFirst({
      where: { id: Number(roomId), members: { some: { userId } } },
      include: {
        members: { include: { user: { select: { id: true, username: true, avatarUrl: true, isOnline: true } } } },
      },
    });

    if (!room) {
      return reply.status(404).send({ success: false, error: '채팅방을 찾을 수 없습니다.' });
    }

    return reply.send({ success: true, data: room });
  });

  // ── 채팅방 나가기 ──────────────────────────────────────────────
  app.delete('/:roomId/leave', async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;
    const { roomId } = req.params as { roomId: string };

    const member = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId: Number(roomId) } },
    });
    if (!member) {
      return reply.status(404).send({ success: false, error: '채팅방 멤버가 아닙니다.' });
    }

    await prisma.roomMember.delete({
      where: { userId_roomId: { userId, roomId: Number(roomId) } },
    });

    return reply.send({ success: true });
  });

  // ── 알림 뮤트 토글 ──────────────────────────────────────────────
  app.patch('/:roomId/mute', async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;
    const { roomId } = req.params as { roomId: string };
    const body = (req.body as { mute?: boolean });
    if (typeof body?.mute !== 'boolean') {
      return reply.status(400).send({ success: false, error: 'mute 값이 필요합니다.' });
    }

    const member = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId: Number(roomId) } },
    });
    if (!member) {
      return reply.status(404).send({ success: false, error: '채팅방 멤버가 아닙니다.' });
    }

    await prisma.roomMember.update({
      where: { userId_roomId: { userId, roomId: Number(roomId) } },
      data: { isMuted: body.mute },
    });

    return reply.send({ success: true, data: { isMuted: body.mute } });
  });
}
