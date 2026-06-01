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

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isAppShell = e.request.mode === 'navigate' || url.pathname.startsWith('/_next/') || url.pathname === '/chat';
  const request = isAppShell ? new Request(e.request, { cache: 'reload' }) : e.request;
  e.respondWith(fetch(request).catch(() => caches.match(e.request)));
});

// 푸시 알림 수신
self.addEventListener('push', (e) => {
  let data = { title: '마이클조던', body: '새 메시지가 도착했습니다.', data: {} };
  try { data = e.data.json(); } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: data.data,
      vibrate: [200, 100, 200],
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
