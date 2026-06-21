import { PrismaClient } from '@prisma/client';

// SQL Server DATETIME 컬럼은 타임존 정보 없음.
// tedious 드라이버는 JS Date를 UTC 그대로 전송하므로,
// 클라우드 SQL Server(UTC)에서는 GETDATE()도 UTC, new Date()도 UTC로 저장됨.
// → KST(UTC+9)로 맞춰서 전송해야 DB에 한국시간이 저장됨.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export function nowKST(): Date {
  return new Date(Date.now() + KST_OFFSET_MS);
}

// 개발 환경에서 핫 리로드 시 인스턴스 중복 생성 방지
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const client = globalForPrisma.prisma ?? new PrismaClient();

// 모델별 생성 시 KST로 주입할 타임스탬프 필드
const CREATE_FIELDS: Record<string, string[]> = {
  User:             ['createdAt', 'updatedAt'],
  RefreshToken:     ['createdAt'],
  Room:             ['createdAt'],
  RoomMember:       ['joinedAt'],
  Message:          ['createdAt'],
  MessageRead:      ['readAt'],
  PushSubscription: ['createdAt'],
  Schedule:         ['createdAt'],
  Post:             ['createdAt', 'updatedAt'],
  Comment:          ['createdAt', 'updatedAt'],
};

// 모델별 수정 시 KST로 주입할 타임스탬프 필드
const UPDATE_FIELDS: Record<string, string[]> = {
  User:    ['updatedAt'],
  Post:    ['updatedAt'],
  Comment: ['updatedAt'],
};

client.$use(async (params, next) => {
  const now = nowKST();
  const model = params.model as string | undefined;

  if (model) {
    if (params.action === 'create') {
      const fields = CREATE_FIELDS[model];
      if (fields && params.args?.data && typeof params.args.data === 'object') {
        for (const field of fields) {
          if (params.args.data[field] === undefined) {
            params.args.data[field] = now;
          }
        }
      }
    } else if (params.action === 'createMany') {
      const fields = CREATE_FIELDS[model];
      if (fields && Array.isArray(params.args?.data)) {
        params.args.data = params.args.data.map((item: Record<string, unknown>) => {
          const patched = { ...item };
          for (const field of fields) {
            if (patched[field] === undefined) patched[field] = now;
          }
          return patched;
        });
      }
    } else if (params.action === 'update' || params.action === 'updateMany') {
      const fields = UPDATE_FIELDS[model];
      if (fields && params.args?.data && typeof params.args.data === 'object') {
        for (const field of fields) {
          params.args.data[field] = now;
        }
      }
    } else if (params.action === 'upsert') {
      const createFields = CREATE_FIELDS[model];
      if (createFields && params.args?.create && typeof params.args.create === 'object') {
        for (const field of createFields) {
          if (params.args.create[field] === undefined) {
            params.args.create[field] = now;
          }
        }
      }
      const updateFields = UPDATE_FIELDS[model];
      if (updateFields && params.args?.update && typeof params.args.update === 'object') {
        for (const field of updateFields) {
          params.args.update[field] = now;
        }
      }
    }
  }

  return next(params);
});

export const prisma = client;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = client;
}
