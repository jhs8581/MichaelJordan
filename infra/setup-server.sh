#!/bin/bash
# ============================================================
# AWS Lightsail Ubuntu 22.04 초기 서버 설정 스크립트
# 실행: bash setup-server.sh
# ============================================================

set -e

echo "📦 시스템 업데이트..."
sudo apt-get update -y && sudo apt-get upgrade -y

echo "🟢 Node.js 20 LTS 설치 (nvm)..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
nvm alias default 20

echo "📦 pnpm & PM2 전역 설치..."
npm install -g pnpm pm2

echo "🌐 Nginx 설치..."
sudo apt-get install -y nginx

echo "🔐 Certbot 설치 (Let's Encrypt SSL)..."
sudo apt-get install -y certbot python3-certbot-nginx

echo "📁 로그 디렉터리 생성..."
sudo mkdir -p /var/log/chat
sudo chown $USER:$USER /var/log/chat

echo ""
echo "✅ 기본 설정 완료!"
echo ""
echo "다음 단계:"
echo "  1. Nginx 설정 파일 복사: sudo cp infra/nginx/chat.conf /etc/nginx/sites-available/chat"
echo "  2. 심볼릭 링크:         sudo ln -s /etc/nginx/sites-available/chat /etc/nginx/sites-enabled/"
echo "  3. SSL 발급:            sudo certbot --nginx -d your-domain.com"
echo "  4. Nginx 재시작:       sudo systemctl restart nginx"
echo "  5. apps/server/.env 파일에서 DATABASE_URL 설정"
echo "  6. DB 마이그레이션:    pnpm --filter @chat/server db:push"
echo "  7. 빌드:               pnpm --filter @chat/server build"
echo "  8. PM2 시작:           pm2 start infra/pm2/ecosystem.config.js"
echo "  9. PM2 재부팅 자동시작: pm2 save && pm2 startup"
