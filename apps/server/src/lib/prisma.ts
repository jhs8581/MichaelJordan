import { PrismaClient } from '@prisma/client';

// SQL Server는 DATETIME에 타임존 정보가 없으므로, Node.js의 new Date()(UTC)를
// tedious 드라이버가 UTC 값 그대로 전송함 → KST로 보정하여 전송
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export function nowKST(): Date {
  return new Date(Date.now() + KST_OFFSET_MS);
}

// 개발 환경에서 핫 리로드 시 인스턴스 중복 생성 방지
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const client = globalForPrisma.prisma ?? new PrismaClient();

// @updatedAt 대체: update/upsert 시 updatedAt을 KST로 자동 주입
// (Prisma @updatedAt은 내부적으로 new Date() = UTC를 사용하므로 직접 처리)
const MODELS_WITH_UPDATED_AT = new Set(['User', 'Post', 'Comment']);
client.$use(async (params, next) => {
  if (params.model && MODELS_WITH_UPDATED_AT.has(params.model)) {
    if (params.action === 'upsert') {
      if (params.args?.update && typeof params.args.update === 'object') {
        params.args.update.updatedAt = nowKST();
      }
    } else if (params.action === 'update' || params.action === 'updateMany') {
      if (params.args?.data && typeof params.args.data === 'object') {
        params.args.data.updatedAt = nowKST();
      }
    }
  }
  return next(params);
});

export const prisma = client;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = client;
}
