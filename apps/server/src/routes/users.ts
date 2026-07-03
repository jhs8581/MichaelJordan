import type { FastifyInstance } from "fastify";
import { requireAuth } from "../plugins/auth";
import { prisma } from "../lib/prisma";
import { z } from "zod";

const updateThemeSchema = z.object({
  chatTheme: z.enum(["slr", "naver", "oliveyoung"]),
});

export async function userRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // ── 전체 사용자 목록 (채팅 상대 선택용) ──────────────────────
  app.get("/", async (req, reply) => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        isOnline: true,
        createdAt: true,
      },
      orderBy: { username: "asc" },
    });
    return reply.send({ success: true, data: users });
  });

  // ── 현재 사용자 테마 조회 ─────────────────────────────────────
  app.get("/me/theme", async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { chatTheme: true },
    });
    return reply.send({ success: true, data: { chatTheme: user?.chatTheme ?? "slr" } });
  });

  // ── 사용자 테마 업데이트 ─────────────────────────────────────
  app.patch("/me/theme", async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;
    const body = updateThemeSchema.safeParse(req.body);
    
    if (!body.success) {
      return reply.status(400).send({ success: false, error: "잘못된 테마" });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { chatTheme: body.data.chatTheme },
      select: { id: true, chatTheme: true },
    });

    console.log(`[THEME] userId=${userId} 테마 변경: ${body.data.chatTheme}`);
    return reply.send({ success: true, data: { chatTheme: user.chatTheme } });
  });

  // ── 여러 사용자의 테마 일괄 조회 ──────────────────────────────
  app.get("/themes", async (req, reply) => {
    const { userIds } = req.query as { userIds?: string };
    
    if (!userIds) {
      return reply.status(400).send({ success: false, error: "userIds 필요" });
    }

    const ids = userIds.split(",").map(Number).filter(Boolean);
    const themes = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, chatTheme: true },
    });

    return reply.send({ success: true, data: themes });
  });
}
