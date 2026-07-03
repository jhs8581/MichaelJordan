import type { FastifyInstance } from "fastify";
import { requireAuth } from "../plugins/auth";
import { prisma } from "../lib/prisma";
import { z } from "zod";

const updateThemeSchema = z.object({
  chatTheme: z.enum(["slr", "naver", "oliveyoung"]),
});

let cachedUserTable: string | null = null;

async function resolveUserTable(): Promise<string> {
  if (cachedUserTable) return cachedUserTable;
  const rows = await prisma.$queryRaw<Array<{ fullName: string }>>`
    SELECT TOP 1
      QUOTENAME(s.name) + '.' + QUOTENAME(t.name) AS fullName
    FROM sys.tables t
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE t.name IN ('User', 'Users')
    ORDER BY CASE t.name WHEN 'User' THEN 0 ELSE 1 END
  `;
  const tableName = rows[0]?.fullName;
  if (!tableName) {
    throw new Error('User 테이블을 찾을 수 없습니다.');
  }
  cachedUserTable = tableName;
  return tableName;
}

export async function userRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // 전체 사용자 목록 (채팅 상대 선택용)
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

  // 현재 사용자 테마 조회
  app.get("/me/theme", async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;
    try {
      const userTable = await resolveUserTable();
      const rows = await prisma.$queryRawUnsafe<Array<{ chatTheme: string | null }>>(
        `SELECT TOP 1 [chatTheme] FROM ${userTable} WHERE [id] = ${Number(userId)}`,
      );
      const rawTheme = rows[0]?.chatTheme;
      const chatTheme = rawTheme === "naver" || rawTheme === "oliveyoung" ? rawTheme : "slr";
      return reply.send({ success: true, data: { chatTheme } });
    } catch (err) {
      console.error("[THEME] 조회 실패, 기본값 반환", err);
      return reply.send({ success: true, data: { chatTheme: "slr" } });
    }
  });

  // 사용자 테마 업데이트
  app.patch("/me/theme", async (req, reply) => {
    const userId = (req.user as { sub: number }).sub;
    const body = updateThemeSchema.safeParse(req.body);
    
    if (!body.success) {
      return reply.status(400).send({ success: false, error: "잘못된 테마" });
    }

    try {
      const theme = body.data.chatTheme;
      const userTable = await resolveUserTable();
      const updatedCount = await prisma.$executeRawUnsafe(
        `UPDATE ${userTable} SET [chatTheme] = '${theme}' WHERE [id] = ${Number(userId)}`,
      );
      if (!updatedCount) {
        console.warn(`[THEME] 업데이트 대상 없음 userId=${userId}`);
        return reply.status(404).send({ success: false, error: "사용자를 찾을 수 없습니다." });
      }
      const verifyRows = await prisma.$queryRawUnsafe<Array<{ chatTheme: string | null }>>(
        `SELECT TOP 1 [chatTheme] FROM ${userTable} WHERE [id] = ${Number(userId)}`,
      );
      const savedTheme = verifyRows[0]?.chatTheme;
      if (savedTheme !== theme) {
        console.error(`[THEME] 업데이트 검증 실패 userId=${userId} expected=${theme} actual=${savedTheme}`);
        return reply.status(500).send({ success: false, error: "테마 저장 검증 실패" });
      }
      console.log(`[THEME] userId=${userId} theme=${theme}`);
      return reply.send({ success: true, data: { chatTheme: theme } });
    } catch (err) {
      console.error(`[THEME] 업데이트 실패 userId=${userId}`, err);
      return reply.status(500).send({ success: false, error: "테마 저장 실패" });
    }
  });

  // 여러 사용자의 테마 일괄 조회
  app.get("/themes", async (req, reply) => {
    const { userIds } = req.query as { userIds?: string };
    
    if (!userIds) {
      return reply.status(400).send({ success: false, error: "userIds 필요" });
    }

    const ids = userIds
      .split(",")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (ids.length === 0) {
      return reply.send({ success: true, data: [] });
    }

    try {
      const userTable = await resolveUserTable();
      const idSql = ids.join(",");
      const rows = await prisma.$queryRawUnsafe<Array<{ id: number; chatTheme: string | null }>>(
        `SELECT [id], [chatTheme] FROM ${userTable} WHERE [id] IN (${idSql})`,
      );
      const themes = rows.map((row) => ({
        id: row.id,
        chatTheme: row.chatTheme === "naver" || row.chatTheme === "oliveyoung" ? row.chatTheme : "slr",
      }));
      return reply.send({ success: true, data: themes });
    } catch (err) {
      console.error("[THEME] 일괄 조회 실패", err);
      return reply.send({ success: true, data: ids.map((id) => ({ id, chatTheme: "slr" })) });
    }
  });
}
