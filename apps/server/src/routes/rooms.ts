import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  isGroup: z.boolean().default(false),
  memberIds: z.array(z.number()).min(1),
});

const updateRoomTimeZonesSchema = z.object({
  timeZone1: z.string().optional(),
  timeZone2: z.string().optional(),
});

function normalizeTimeZone(value: string | undefined): string | null {
  const timeZone = (value ?? '').trim();
  if (!timeZone) return null;
  try {
    new Intl.DateTimeFormat('ko-KR', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return null;
  }
}

async function updateRoomTimeZonesHandler(req: any, reply: any) {
  const userId = (req.user as { sub: number }).sub;
  const { roomId } = req.params as { roomId: string };
  const body = updateRoomTimeZonesSchema.safeParse(req.body);
  if (!body.success) {
    return reply.status(400).send({ success: false, error: body.error.message });
  }

  const member = await prisma.roomMember.findUnique({
    where: { userId_roomId: { userId, roomId: Number(roomId) } },
  });
  if (!member) {
    return reply.status(404).send({ success: false, error: '채팅방 멤버가 아닙니다.' });
  }

  const normalizedTimeZone1 = normalizeTimeZone(body.data.timeZone1) ?? null;
  const normalizedTimeZone2 = normalizeTimeZone(body.data.timeZone2) ?? null;

  if (normalizedTimeZone1 && normalizedTimeZone2 && normalizedTimeZone1 === normalizedTimeZone2) {
    return reply.status(400).send({ success: false, error: '설정시간1과 설정시간2는 서로 달라야 합니다.' });
  }

  const updated = await prisma.room.update({
    where: { id: Number(roomId) },
    data: {
      roomTimeZone1: normalizedTimeZone1,
      roomTimeZone2: normalizedTimeZone2,
    },
    include: {
      members: { include: { user: { select: { id: true, username: true, avatarUrl: true, isOnline: true } } } },
    },
  });

  return reply.send({ success: true, data: updated });
}

export async function roomRoutes(app: FastifyInstance) {
  // 인증 필요
  app.addHook('preHandler', requireAuth);
  // ── 나의 보관함 조회 또는 생성 ───────────────────────────────────────
  app.get('/archive', async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;

    let room = await prisma.room.findFirst({
      where: { isArchive: true, members: { some: { userId } } },
      include: {
        members: { include: { user: { select: { id: true, username: true, avatarUrl: true, isOnline: true } } } },
      },
    });

    if (!room) {
      room = await prisma.room.create({
        data: {
          name: '나의 보관함',
          isGroup: false,
          isArchive: true,
          members: { create: [{ userId }] },
        },
        include: {
          members: { include: { user: { select: { id: true, username: true, avatarUrl: true, isOnline: true } } } },
        },
      });
    }

    return reply.send({ success: true, data: { ...room, isMuted: false } });
  });
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

    if (rooms.length === 0) {
      return reply.send({ success: true, data: [] });
    }

    const roomIds = rooms
      .map((room) => Number(room.id))
      .filter((id) => Number.isFinite(id));
    const roomIdSql = roomIds.join(',');

    // isMuted: 현재 유저의 뮤트 여부를 각 방에 주입
    const memberMap = await prisma.roomMember.findMany({
      where: { userId, roomId: { in: roomIds } },
      select: { roomId: true, isMuted: true },
    });
    const muteByRoom = Object.fromEntries(memberMap.map((m) => [m.roomId, m.isMuted]));

    const unreadRows = roomIdSql
      ? await prisma.$queryRawUnsafe<Array<{ roomId: number; unreadCount: number | bigint }>>(
          `WITH lastReads AS (
             SELECT m.[roomId] AS roomId, MAX(mr.[messageId]) AS lastReadMessageId
             FROM [MessageRead] mr
             INNER JOIN [Message] m ON m.[id] = mr.[messageId]
             WHERE mr.[userId] = ${Number(userId)}
               AND m.[roomId] IN (${roomIdSql})
             GROUP BY m.[roomId]
           )
           SELECT m.[roomId] AS roomId, COUNT_BIG(1) AS unreadCount
           FROM [Message] m
           LEFT JOIN lastReads lr ON lr.roomId = m.[roomId]
           WHERE m.[roomId] IN (${roomIdSql})
             AND m.[senderId] <> ${Number(userId)}
             AND m.[id] > ISNULL(lr.lastReadMessageId, 0)
           GROUP BY m.[roomId]`,
        )
      : [];
    const unreadByRoom = Object.fromEntries(
      unreadRows.map((row) => [row.roomId, Number(row.unreadCount)]),
    );
    const roomsWithMute = rooms.map((r) => ({
      ...r,
      isMuted: muteByRoom[r.id] ?? false,
      unreadCount: unreadByRoom[r.id] ?? 0,
    }));

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

  // ── 방 공통 시간대 설정 (모든 멤버 변경 가능) ──────────────────────
  app.patch('/:roomId/time-zones', updateRoomTimeZonesHandler);
  // 구버전 클라이언트 오타 경로 호환
  app.patch('/:roomId/tine-zones', updateRoomTimeZonesHandler);
}
