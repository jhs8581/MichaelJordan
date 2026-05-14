self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
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
  const url = roomId ? `/chat?room=${roomId}` : '/chat';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes('/chat'));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
