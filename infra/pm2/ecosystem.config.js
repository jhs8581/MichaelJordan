// ============================================================
// PM2 에코시스템 설정 (Lightsail 배포용)
// 사용법: pm2 start ecosystem.config.js
// ============================================================

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
        CORS_ORIGIN: 'https://mjchat.vercel.app,https://michael-jordan-web.vercel.app',
        VAPID_PUBLIC_KEY: 'BB2mAmRavxRSZuNI4PudmztwgHtvUgMIa8wLl-dwp9Ln0OCbmIc-5vUhobtNpa7PSdJkE6TA2pf4lK9morCMthM',
        VAPID_PRIVATE_KEY: '1RpkDbLItgggOO4QJzb0dFKYXH_pirmz_N_DsVsYQqs',
        VAPID_SUBJECT: 'mailto:admin@michaeljordan.app',
      },
      error_file: '/var/log/chat/error.log',
      out_file: '/var/log/chat/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
