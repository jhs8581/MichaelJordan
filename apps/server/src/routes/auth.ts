import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, nowKST } from '../lib/prisma';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs';
import path from 'node:path';

const ALLOWED_AVATAR_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

const registerSchema = z.object({
  password: z.string().min(1),
  username: z.string().min(2).max(50),
});

const loginSchema = z.object({
  username: z.string().min(2),
  password: z.string(),
});

const timeZoneSchema = z.object({
  timeZone: z.string().trim().max(100).optional().nullable(),
});

function normalizeTimeZone(value: string | null | undefined): string | null {
  const timeZone = (value ?? '').trim();
  if (!timeZone) return null;
  try {
    new Intl.DateTimeFormat('ko-KR', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return null;
  }
}

export async function authRoutes(app: FastifyInstance) {
  // ── 회원가입 ──────────────────────────────────────────────────
  app.post('/register', async (req, reply) => {
    const body = registerSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: body.error.message });
    }

    const { password, username } = body.data;
    const email = `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@mj.local`;

    const exists = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
    if (exists) {
      return reply.status(409).send({ success: false, error: '이미 사용 중인 닉네임입니다.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, username, passwordHash },
      select: { id: true, email: true, username: true, chatLockCode: true, avatarUrl: true, timeZone: true, createdAt: true },
    });

    return reply.status(201).send({ success: true, data: user });
  });

  // ── 로그인 ────────────────────────────────────────────────────
  app.post('/login', async (req, reply) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: body.error.message });
    }

    const { username, password } = body.data;

    const user = await prisma.user.findFirst({ where: { username } });
    if (!user) {
      return reply.status(401).send({ success: false, error: '닉네임 또는 비밀번호가 올바르지 않습니다.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ success: false, error: '닉네임 또는 비밀번호가 올바르지 않습니다.' });
    }

    const accessToken = app.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: '15m' }
    );
    const refreshToken = app.jwt.sign(
      { sub: user.id, type: 'refresh' },
      { expiresIn: '365d' }
    );

    const expiresAt = new Date(nowKST().getTime() + 365 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt },
    });

    // 온라인 상태 업데이트
    await prisma.user.update({
      where: { id: user.id },
      data: { isOnline: true },
    });

    return reply.send({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          chatLockCode: user.chatLockCode,
          avatarUrl: user.avatarUrl,
          timeZone: user.timeZone,
        },
      },
    });
  });

  // ── 내 정보 조회 (chatLockCode 포함) ───────────────────────────
  app.get('/me', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ success: false, error: '인증이 필요합니다.' });
    }

    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);
    if (!userId) {
      return reply.status(401).send({ success: false, error: '유효하지 않은 토큰입니다.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        chatLockCode: true,
        avatarUrl: true,
        timeZone: true,
        isOnline: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: '사용자를 찾을 수 없습니다.' });
    }

    return reply.send({ success: true, data: user });
  });

  // ── 토큰 갱신 ─────────────────────────────────────────────────
  app.post('/refresh', async (req, reply) => {
    const body = (req.body as { refreshToken?: string });
    if (!body?.refreshToken) {
      return reply.status(400).send({ success: false, error: 'refreshToken이 필요합니다.' });
    }

    let payload: { sub: number };
    try {
      payload = app.jwt.verify<{ sub: number }>(body.refreshToken);
    } catch {
      return reply.status(401).send({ success: false, error: '유효하지 않은 토큰입니다.' });
    }

    const stored = await prisma.refreshToken.findUnique({
      where: { token: body.refreshToken },
    });
    if (!stored || stored.expiresAt < nowKST()) {
      return reply.status(401).send({ success: false, error: '만료된 토큰입니다.' });
    }

    // 기존 토큰 교체 (Refresh Token Rotation)
    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const accessToken = app.jwt.sign({ sub: payload.sub }, { expiresIn: '15m' });
    const newRefreshToken = app.jwt.sign({ sub: payload.sub, type: 'refresh' }, { expiresIn: '365d' });

    const expiresAt = new Date(nowKST().getTime() + 365 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: { token: newRefreshToken, userId: payload.sub, expiresAt },
    });

    return reply.send({ success: true, data: { accessToken, refreshToken: newRefreshToken } });
  });

  // ── 사용자 시간대 설정 ────────────────────────────────────────
  app.patch('/time-zone', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ success: false, error: '인증이 필요합니다.' });
    }

    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);
    if (!userId) {
      return reply.status(401).send({ success: false, error: '유효하지 않은 토큰입니다.' });
    }

    const body = timeZoneSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: body.error.message });
    }

    const timeZone = normalizeTimeZone(body.data.timeZone);
    if (body.data.timeZone && !timeZone) {
      return reply.status(400).send({ success: false, error: '올바른 시간대가 아닙니다.' });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { timeZone },
      select: { id: true, email: true, username: true, chatLockCode: true, avatarUrl: true, timeZone: true, isOnline: true, createdAt: true },
    });

    return reply.send({ success: true, data: user });
  });

  // ── 잠금 코드 설정/변경 ────────────────────────────────────────
  app.patch('/lock-code', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ success: false, error: '인증이 필요합니다.' });
    }

    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);
    if (!userId) {
      return reply.status(401).send({ success: false, error: '유효하지 않은 토큰입니다.' });
    }

    const body = (req.body as { code?: string });
    const code = (body?.code ?? '').trim();
    if (code.length > 0 && !/^\d{1,16}$/.test(code)) {
      return reply.status(400).send({ success: false, error: '잠금 코드는 숫자만 입력 가능합니다.' });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { chatLockCode: code },
      select: { id: true, email: true, username: true, chatLockCode: true, avatarUrl: true, timeZone: true, isOnline: true, createdAt: true },
    });

    return reply.send({ success: true, data: user });
  });

  // ── 로그아웃 ──────────────────────────────────────────────────
  app.post('/logout', async (req, reply) => {
    const body = (req.body as { refreshToken?: string });
    if (body?.refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: body.refreshToken } });
    }
    return reply.send({ success: true });
  });

  // ── 프로필 사진 변경 ───────────────────────────────────────────
  app.patch('/avatar', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ success: false, error: '인증이 필요합니다.' });
    }
    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);
    if (!userId) return reply.status(401).send({ success: false, error: '유효하지 않은 토큰입니다.' });

    const data = await req.file({ limits: { fileSize: 5 * 1024 * 1024 } });
    if (!data) return reply.status(400).send({ success: false, error: '파일이 없습니다.' });

    const ext = path.extname(data.filename).toLowerCase();
    if (!ALLOWED_AVATAR_EXTS.has(ext)) {
      return reply.status(400).send({ success: false, error: '이미지 파일만 업로드 가능합니다.' });
    }

    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const uniqueName = `avatar-${userId}-${Date.now()}${ext}`;
    await pipeline(data.file, fs.createWriteStream(path.join(uploadDir, uniqueName)));

    const baseUrl = process.env.BASE_URL ?? 'https://15.164.117.143.nip.io';
    const avatarUrl = `${baseUrl}/api/messages/file/${uniqueName}`;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: { id: true, email: true, username: true, chatLockCode: true, avatarUrl: true, timeZone: true, isOnline: true, createdAt: true },
    });
    return reply.send({ success: true, data: user });
  });

  // ── 닉네임 변경 ───────────────────────────────────────────────
  app.patch('/username', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ success: false, error: '인증이 필요합니다.' });
    }
    const payload = req.user as { sub?: number | string };
    const userId = Number(payload?.sub);
    if (!userId) return reply.status(401).send({ success: false, error: '유효하지 않은 토큰입니다.' });

    const body = (req.body as { username?: string });
    const username = (body?.username ?? '').trim();
    if (username.length < 2 || username.length > 50) {
      return reply.status(400).send({ success: false, error: '닉네임은 2~50자여야 합니다.' });
    }
    const exists = await prisma.user.findFirst({ where: { username, NOT: { id: userId } } });
    if (exists) {
      return reply.status(409).send({ success: false, error: '이미 사용 중인 닉네임입니다.' });
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: { username },
      select: { id: true, email: true, username: true, chatLockCode: true, avatarUrl: true, timeZone: true, isOnline: true, createdAt: true },
    });
    return reply.send({ success: true, data: user });
  });
}
