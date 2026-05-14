#!/bin/bash
# ============================================================
# 재배포 스크립트 (초기 설정 완료 후 업데이트할 때 사용)
# 실행: bash infra/deploy.sh
# 위치: 프로젝트 루트(/home/ubuntu/chat)에서 실행
# ============================================================

set -e

PROJECT_DIR="/home/ubuntu/chat"
cd "$PROJECT_DIR"

echo "📥 최신 코드 Pull..."
git pull origin main

echo "📦 의존성 설치..."
pnpm install --frozen-lockfile

echo "🔄 DB 마이그레이션..."
pnpm --filter @chat/server db:generate
pnpm --filter @chat/server db:push

echo "🔨 서버 빌드..."
pnpm --filter @chat/server build

echo "🔁 PM2 재시작..."
pm2 reload chat-server --update-env

pm2 save

echo "✅ 배포 완료!"
pm2 status
