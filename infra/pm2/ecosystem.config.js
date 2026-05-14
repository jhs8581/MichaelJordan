# ============================================================
# PM2 에코시스템 설정 (Lightsail 배포용)
# 사용법: pm2 start ecosystem.config.js
# ============================================================

module.exports = {
  apps: [
    {
      name: 'chat-server',
      script: 'dist/index.js',
      cwd: '/home/ubuntu/chat/apps/server',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        CORS_ORIGIN: 'http://15.164.117.143',
      },
      error_file: '/var/log/chat/error.log',
      out_file: '/var/log/chat/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
