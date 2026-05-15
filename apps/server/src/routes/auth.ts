import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const registerSchema = z.object({
  password: z.string().min(1),
  username: z.string().min(2).max(50),
});

const loginSchema = z.object({
  username: z.string().min(2),
  password: z.string(),
});

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
      select: { id: true, email: true, username: true, chatLockCode: true, avatarUrl: true, createdAt: true },
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
      { expiresIn: '7d' }
    );

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
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
    if (!stored || stored.expiresAt < new Date()) {
      return reply.status(401).send({ success: false, error: '만료된 토큰입니다.' });
    }

    // 기존 토큰 교체 (Refresh Token Rotation)
    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const accessToken = app.jwt.sign({ sub: payload.sub }, { expiresIn: '15m' });
    const newRefreshToken = app.jwt.sign({ sub: payload.sub, type: 'refresh' }, { expiresIn: '7d' });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: { token: newRefreshToken, userId: payload.sub, expiresAt },
    });

    return reply.send({ success: true, data: { accessToken, refreshToken: newRefreshToken } });
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
      select: { id: true, email: true, username: true, chatLockCode: true, avatarUrl: true, isOnline: true, createdAt: true },
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
}
