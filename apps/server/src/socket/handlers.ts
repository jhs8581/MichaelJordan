import type { Server, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@chat/types';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';

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
      const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'changeme-min-32-chars-secret-key!') as { sub: number };
      (socket as ChatSocket & { userId: number }).userId = payload.sub;
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
      if (!sanitizedContent) return;

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
