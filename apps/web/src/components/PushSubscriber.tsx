'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function PushSubscriber() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission === 'denied') return;
    if (asked) return;

    // 이미 granted면 바로 구독, 아니면 배너로 물어봄
    if (Notification.permission === 'granted') {
      subscribe();
    }
    // 'default' 상태면 PushBanner 컴포넌트에서 처리
  }, [accessToken]);

  async function subscribe() {
    try {
      const sw = await navigator.serviceWorker.ready;
      const existing = await sw.pushManager.getSubscription();
      if (existing) return; // 이미 구독 중

      const { data } = await api.get('/push/vapid-public-key');
      const sub = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.key),
      });
      const json = sub.toJSON();
      await api.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      });
    } catch {}
  }

  return null;
}

// 알림 허용 배너 (로그인 후 처음 한 번)
export function PushBanner() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      setShow(true);
    }
  }, [accessToken]);

  if (!show) return null;

  async function allow() {
    setShow(false);
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
    // 허용 후 구독 진행
    try {
      const sw = await navigator.serviceWorker.ready;
      const { data } = await api.get('/push/vapid-public-key');
      const sub = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: (() => {
          const padding = '='.repeat((4 - (data.key.length % 4)) % 4);
          const base64 = (data.key + padding).replace(/-/g, '+').replace(/_/g, '/');
          const rawData = atob(base64);
          return Uint8Array.from([...rawData].map((c: string) => c.charCodeAt(0)));
        })(),
      });
      const json = sub.toJSON();
      await api.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      });
    } catch {}
  }

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: '#2b2d31', border: '1px solid #3f4349', borderRadius: 8,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
      zIndex: 9998, color: '#fff', fontSize: 14, whiteSpace: 'nowrap',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    }}>
      <span>🔔 새 메시지 알림을 받으시겠습니까?</span>
      <button onClick={allow}
        style={{ background: '#5865f2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
        허용
      </button>
      <button onClick={() => setShow(false)}
        style={{ background: 'transparent', color: '#6d6f78', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>
        ×
      </button>
    </div>
  );
}
