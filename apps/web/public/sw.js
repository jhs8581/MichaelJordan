self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

const THEME_ICON_PRESETS = {
  naver: { bg: '#03C75A', fg: '#FFFFFF', label: 'N' },
  oliveyoung: { bg: '#00C4B4', fg: '#FFFFFF', label: 'OY' },
  slr: { bg: '#4F5BD5', fg: '#FFFFFF', label: 'SLR' },
};

const generatedIconCache = new Map();

function normalizeTheme(theme) {
  const key = String(theme || '').trim().toLowerCase();
  return key === 'naver' || key === 'oliveyoung' ? key : 'slr';
}

async function createThemeIcon(theme, size, isBadge) {
  const cacheKey = `${theme}-${size}-${isBadge ? 'badge' : 'icon'}`;
  const cached = generatedIconCache.get(cacheKey);
  if (cached) return cached;

  if (typeof OffscreenCanvas === 'undefined') return null;

  try {
    const preset = THEME_ICON_PRESETS[theme] || THEME_ICON_PRESETS.slr;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (isBadge) {
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const r = Math.max(10, Math.floor(size * 0.22));
      ctx.fillStyle = preset.bg;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(size - r, 0);
      ctx.quadraticCurveTo(size, 0, size, r);
      ctx.lineTo(size, size - r);
      ctx.quadraticCurveTo(size, size, size - r, size);
      ctx.lineTo(r, size);
      ctx.quadraticCurveTo(0, size, 0, size - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = preset.fg;
      ctx.font = `700 ${Math.max(26, Math.floor(size * 0.26))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(preset.label, size / 2, size / 2 + 1);
    }

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const url = URL.createObjectURL(blob);
    generatedIconCache.set(cacheKey, url);
    return url;
  } catch {
    return null;
  }
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isAppShell = e.request.mode === 'navigate' || url.pathname.startsWith('/_next/') || url.pathname === '/chat';
  const request = isAppShell ? new Request(e.request, { cache: 'reload' }) : e.request;
  e.respondWith(fetch(request).catch(() => caches.match(e.request)));
});

// 푸시 알림 수신
self.addEventListener('push', (e) => {
  let data = { title: '라이프 스토어', body: '새 메시지가 도착했습니다.', data: {}, tag: 'chat-message' };
  try { data = e.data.json(); } catch {}

  const theme = normalizeTheme(data?.data?.theme);
  const fallbackByTheme = {
    naver: {
      iconUrl: '/push-icons/naver-icon.svg',
      badgeUrl: '/push-icons/naver-badge.svg',
      imageUrl: '/push-icons/naver-image.svg',
    },
    oliveyoung: {
      iconUrl: '/push-icons/oliveyoung-icon.svg',
      badgeUrl: '/push-icons/oliveyoung-badge.svg',
      imageUrl: '/push-icons/oliveyoung-image.svg',
    },
    slr: {
      iconUrl: '/push-icons/slr-icon.svg',
      badgeUrl: '/push-icons/slr-badge.svg',
      imageUrl: '/push-icons/slr-image.svg',
    },
  };
  const fallback = fallbackByTheme[theme] || fallbackByTheme.slr;
  const payloadIcon = data?.data?.iconUrl || fallback.iconUrl;
  const payloadBadge = data?.data?.badgeUrl || fallback.badgeUrl;
  // Windows/PWA 알림 카드가 과도하게 커지는 문제를 막기 위해 image는 사용하지 않음
  
  e.waitUntil(
    // iOS에서 tag가 제대로 작동하지 않으므로 기존 알림들을 먼저 닫음
    Promise.all([
      self.registration.getNotifications(),
      createThemeIcon(theme, 192, false),
      createThemeIcon(theme, 96, true),
    ]).then(([notifications, generatedIcon, generatedBadge]) => {
      notifications.forEach((notification) => notification.close());
      const icon = generatedIcon || payloadIcon;
      const badge = generatedBadge || payloadBadge;
      return self.registration.showNotification(data.title, {
        body: data.body,
        data: data.data,
        icon,
        badge,
        tag: data.tag || 'chat-message', // 동일한 tag로 알림이 덮어씌워져 최근 1건만 표시됨
        renotify: true, // tag가 같은 알림이 와도 진동/소리 알림
        vibrate: [200, 100, 200],
      });
    })
  );
});

// 알림 클릭 시 앱으로 포커스
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const roomId = e.notification.data?.roomId;
  const scheduleId = e.notification.data?.scheduleId;
  let url = '/chat';
  if (roomId) url = `/chat?room=${roomId}`;
  else if (scheduleId) url = `/chat?view=schedule`;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes('/chat'));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
