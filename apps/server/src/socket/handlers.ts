import type { Server, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@chat/types';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';
import { sendPushToUsers } from '../routes/push';

type ChatServer = Server<ClientToServerEvents, ServerToClientEvents>;
type ChatSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerSocketHandlers(io: ChatServer) {
  // ── 인증 미들웨어 ─────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('인증 토큰이 없습니다.'));
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'changeme-min-32-chars-secret-key!') as unknown as { sub: number | string };
      // Number() 강제 변환: JWT sub가 string으로 디코딩될 경우에도 number로 보장
      (socket as ChatSocket & { userId: number }).userId = Number(payload.sub);
      next();
    } catch {
      next(new Error('유효하지 않은 토큰입니다.'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = (socket as ChatSocket & { userId: number }).userId;
    console.log(`🟢 연결: userId=${userId} socketId=${socket.id}`);

    // 온라인 상태 업데이트 및 브로드캐스트
    await prisma.user.update({ where: { id: userId }, data: { isOnline: true } });
    io.emit('user:status', { userId, isOnline: true });

    // 이 소켓에게 현재 온라인인 사용자 목록을 전송
    // (연결 시점 이전에 이미 온라인인 사용자 상태를 놓치지 않도록)
    const onlineUsers = await prisma.user.findMany({
      where: { isOnline: true, id: { not: userId } },
      select: { id: true },
    });
    for (const u of onlineUsers) {
      socket.emit('user:status', { userId: u.id, isOnline: true });
    }

    // 사용자가 속한 모든 채팅방에 자동 join
    const rooms = await prisma.roomMember.findMany({ where: { userId }, select: { roomId: true } });
    for (const { roomId } of rooms) {
      socket.join(`room:${roomId}`);
    }

    // ── 채팅방 입장 ─────────────────────────────────────────────
    socket.on('room:join', async (roomId) => {
      const member = await prisma.roomMember.findUnique({
        where: { userId_roomId: { userId, roomId } },
      });
      if (!member) return;
      socket.join(`room:${roomId}`);
    });

    // ── 채팅방 퇴장 ─────────────────────────────────────────────
    socket.on('room:leave', (roomId) => {
      socket.leave(`room:${roomId}`);
    });

    // ── 채팅방 화면 보기 시작/종료 (푸시 제외 기준) ──────────────
    socket.on('room:viewing', (roomId) => {
      socket.join(`viewing:${roomId}`);
    });
    socket.on('room:stop-viewing', (roomId) => {
      socket.leave(`viewing:${roomId}`);
    });

    // ── 타이핑 표시 ─────────────────────────────────────────────
    const typingTimers = new Map<number, ReturnType<typeof setTimeout>>();

    async function broadcastTyping(roomId: number, isTyping: boolean) {
      const member = await prisma.roomMember.findUnique({
        where: { userId_roomId: { userId, roomId } },
      });
      if (!member) return;
      const userInfo = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
      socket.to(`room:${roomId}`).emit('typing:update', {
        roomId, userId, username: userInfo?.username ?? '', isTyping,
      });
    }

    socket.on('typing:start', ({ roomId }) => {
      // 기존 타이머 초기화 후 3초 후 자동 종료
      const existing = typingTimers.get(roomId);
      if (existing) clearTimeout(existing);
      broadcastTyping(roomId, true);
      typingTimers.set(roomId, setTimeout(() => {
        broadcastTyping(roomId, false);
        typingTimers.delete(roomId);
      }, 3000));
    });

    socket.on('typing:stop', ({ roomId }) => {
      const existing = typingTimers.get(roomId);
      if (existing) { clearTimeout(existing); typingTimers.delete(roomId); }
      broadcastTyping(roomId, false);
    });

    // ── 메시지 전송 ─────────────────────────────────────────────
    socket.on('message:send', async ({ roomId, content, fileUrl }) => {
      // 멤버 권한 검증
      const member = await prisma.roomMember.findUnique({
        where: { userId_roomId: { userId, roomId } },
      });
      if (!member) return;

      // XSS 방지: 클라이언트 렌더링 시 dangerouslySetInnerHTML 사용 금지
      // 메시지는 텍스트로만 저장하고 렌더링은 이스케이프된 텍스트로 처리
      const sanitizedContent = content.trim();
      // 이미지 전용 메시지는 빈 content 허용
      if (!sanitizedContent && !fileUrl) return;

      const message = await prisma.message.create({
        data: { roomId, senderId: userId, content: sanitizedContent, fileUrl },
        include: {
          sender: { select: { id: true, username: true, avatarUrl: true } },
          reads: true,
        },
      });

      const payload = {
        id: message.id,
        roomId: message.roomId,
        senderId: message.senderId,
        content: message.content,
        fileUrl: message.fileUrl ?? undefined,
        createdAt: message.createdAt.toISOString(),
        sender: message.sender
          ? {
              id: message.sender.id,
              username: message.sender.username,
              avatarUrl: message.sender.avatarUrl ?? undefined,
            }
          : undefined,
        reads: message.reads.map((r) => ({
          messageId: r.messageId,
          userId: r.userId,
          readAt: r.readAt.toISOString(),
        })),
      };

      io.to(`room:${roomId}`).emit('message:new', payload);

      // 지금 이 채팅방을 화면에 띄워서 보고 있는 유저 (실시간으로 읽는 중)
      const viewingSockets = await io.in(`viewing:${roomId}`).fetchSockets();
      const viewingUserIds = new Set(
        viewingSockets.map((s) => Number((s as unknown as { userId: number }).userId)),
      );

      // 방 멤버 중 발신자 제외 + 지금 이 방을 보고 있지 않은 사람에게 푸시
      const allMembers = await prisma.roomMember.findMany({
        where: { roomId },
        select: { userId: true },
      });
      const pushTargetIds = allMembers
        .map((m) => m.userId)
        .filter((id) => id !== userId && !viewingUserIds.has(id));

      if (pushTargetIds.length > 0) {
        const sender = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
        const senderName = sender?.username ?? '누군가';
        const pushBody = payload.fileUrl
          ? `${senderName}: 📷 이미지`
          : `${senderName}: ${payload.content.slice(0, 60)}`;
        sendPushToUsers(pushTargetIds, {
          title: '마이클조던',
          body: pushBody,
          data: { roomId },
        });
      }
    });

    // ── 읽음 처리 ───────────────────────────────────────────────
    socket.on('message:read', async ({ roomId, messageId }) => {
      await prisma.messageRead.upsert({
        where: { messageId_userId: { messageId, userId } },
        create: { messageId, userId },
        update: { readAt: new Date() },
      });

      io.to(`room:${roomId}`).emit('message:read', {
        roomId,
        userId,
        lastReadMessageId: messageId,
      });
    });

    // ── 연결 해제 ───────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`🔴 연결 해제: userId=${userId}`);
      await prisma.user.update({
        where: { id: userId },
        data: { isOnline: false, lastSeenAt: new Date() },
      });
      io.emit('user:status', { userId, isOnline: false });
    });
  });
}
