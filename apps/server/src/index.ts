import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { Server } from 'socket.io';
import fs from 'node:fs';
import path from 'node:path';
import type { ServerToClientEvents, ClientToServerEvents } from '@chat/types';

import { prisma } from './lib/prisma';
import { nowKST } from './lib/prisma';
import { authRoutes } from './routes/auth';
import { roomRoutes } from './routes/rooms';
import { messageRoutes } from './routes/messages';
import { userRoutes } from './routes/users';
import { pushRoutes, sendPushToUsers } from './routes/push';
import { scheduleRoutes } from './routes/schedules';
import { postRoutes } from './routes/posts';
import { commentRoutes } from './routes/comments';
import { registerSocketHandlers } from './socket/handlers';
import { setChatIo } from './lib/chat-io';

const PORT = Number(process.env.PORT ?? 4000);
const CORS_ORIGIN = (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(',').map(s => s.trim());

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (CORS_ORIGIN.includes(origin)) return true;
  // vercel.app 서브도메인 전체 허용
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return true;
  // localhost 허용
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

async function main() {
  const app = Fastify({ logger: true });

  // ── Plugins ────────────────────────────────────────────────────
  await app.register(cors, {
    origin: (origin, cb) => {
      if (isAllowedOrigin(origin)) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origin ${origin} not allowed`), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'changeme-min-32-chars-secret-key!',
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    // 이미지/파일 서빙 경로는 rate limit 제외 (썸네일 대량 로딩)
    skipOnError: true,
    allowList: (req) => req.url.startsWith('/api/messages/file/'),
  });

  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB (동영상 지원)
  });

  // ── 파일 서빙 (인증 불필요, 루트 레벨에서 직접 등록) ─────────────
  const EXT_MIME: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4',
  };
  app.get('/api/messages/file/:filename', async (req, reply) => {
    const { filename } = req.params as { filename: string };
    if (!/^[a-zA-Z0-9_\-]+\.[a-zA-Z0-9]{2,5}$/.test(filename)) {
      return reply.status(400).send({ error: 'Invalid filename' });
    }
    const filePath = path.join(process.cwd(), 'uploads', filename);
    try {
      const stat = await fs.promises.stat(filePath);
      const ext = path.extname(filename).toLowerCase();
      const mimeType = EXT_MIME[ext] ?? 'application/octet-stream';
      const fileSize = stat.size;
      const rangeHeader = (req.headers as Record<string, string | undefined>)['range'];
      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;
        reply
          .status(206)
          .header('Content-Range', `bytes ${start}-${end}/${fileSize}`)
          .header('Accept-Ranges', 'bytes')
          .header('Content-Length', chunkSize)
          .type(mimeType);
        return reply.send(fs.createReadStream(filePath, { start, end }));
      }
      reply
        .header('Accept-Ranges', 'bytes')
        .header('Content-Length', fileSize)
        .type(mimeType);
      return reply.send(fs.createReadStream(filePath));
    } catch {
      return reply.status(404).send({ error: 'File not found' });
    }
  });

  // ── Routes ─────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(roomRoutes, { prefix: '/api/rooms' });
  await app.register(messageRoutes, { prefix: '/api/messages' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(pushRoutes, { prefix: '/api/push' });
  await app.register(scheduleRoutes, { prefix: '/api/schedules' });
  await app.register(postRoutes, { prefix: '/api/posts' });
  await app.register(commentRoutes, { prefix: '/api/comments' });

  app.get('/health', async () => ({
    ok: true,
    build: 'message-timezone-v3',
  }));

  // ── ready 후 app.server로 Socket.io 연결 ──────────────────────
  await app.ready();

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
    cors: { origin: CORS_ORIGIN, credentials: true },
  });

  setChatIo(io);
  registerSocketHandlers(io);

  // ── Start ──────────────────────────────────────────────────────
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`✅  Server running on http://0.0.0.0:${PORT}`);

  // ── 일정 알람 스케줄러 (1분마다 확인) ───────────────────────
  setInterval(async () => {
    try {
      const now = nowKST();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      const dueSchedules = await prisma.schedule.findMany({
        where: { scheduledAt: { gte: oneMinuteAgo, lte: now }, notified: false },
      });
      if (dueSchedules.length === 0) return;

      for (const schedule of dueSchedules) {
        const members = await prisma.roomMember.findMany({
          where: { roomId: schedule.roomId },
          select: { userId: true },
        });
        const userIds = members.map((m) => m.userId);
        await sendPushToUsers(userIds, {
          type: 'schedule',
          title: '📅 일정 알람',
          body: schedule.title,
          scheduleId: schedule.id,
        });
        await prisma.schedule.update({ where: { id: schedule.id }, data: { notified: true } });
      }
    } catch (err) {
      console.error('일정 알람 오류:', err);
    }
  }, 60 * 1000);

  // ── 데이터 클렌징 (24시간마다) ────────────────────────────────
  async function runCleanup() {
    try {
      const now = nowKST();

      // 1) 만료된 RefreshToken 삭제
      const { count: tokenCount } = await prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: now } },
      });

      // 2) 30일 이상 된 MessageRead 삭제 (해당 메시지 createdAt 기준)
      const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const { count: readCount } = await prisma.messageRead.deleteMany({
        where: { message: { createdAt: { lt: cutoff } } },
      });

      console.log(`🧹 클렌징 완료 — RefreshToken: ${tokenCount}건, MessageRead: ${readCount}건 삭제`);
    } catch (err) {
      console.error('데이터 클렌징 오류:', err);
    }
  }

  // 서버 시작 후 1분 뒤 첫 실행, 이후 24시간마다
  setTimeout(() => {
    runCleanup();
    setInterval(runCleanup, 24 * 60 * 60 * 1000);
  }, 60 * 1000);
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
