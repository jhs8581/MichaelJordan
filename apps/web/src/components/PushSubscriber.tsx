'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { usePreferencesStore } from '@/store/preferences';
import { api } from '@/lib/api';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// 구독 상태 플래그 (중복 구독 방지)
let subscriptionInProgress = false;
let subscribed = false;

export default function PushSubscriber() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as Window & { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron) {
      return;
    }
    if (!accessToken) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission === 'denied') return;
    if (asked) return;

    // 이미 granted면 바로 구독, 아니면 배너로 물어봄
    if (Notification.permission === 'granted' && !subscribed && !subscriptionInProgress) {
      subscribe();
    }
    // 'default' 상태면 PushBanner 컴포넌트에서 처리
  }, [accessToken, asked]);

  async function subscribe() {
    if (subscriptionInProgress || subscribed) return;
    subscriptionInProgress = true;
    
    try {
      const sw = await navigator.serviceWorker.ready;
      const { data } = await api.get('/push/vapid-public-key');

      // 기존 구독이 있으면 그대로 사용, 없으면 새로 구독
      // 중요: 계정이 바뀌어도 현재 로그인한 계정으로 서버에 재등록해야 알림이 옴
      let sub = await sw.pushManager.getSubscription();
      if (!sub) {
        sub = await sw.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.key),
        });
      }
      const json = sub.toJSON();
      // 항상 현재 계정(userId)으로 서버에 등록 (push.ts에서 중복 방지 처리)
      await api.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      });
      subscribed = true;
      console.log('[PUSH] 성공적으로 구독되었습니다');
    } catch (err) {
      console.error('[PUSH] 구독 실패:', err instanceof Error ? err.message : String(err));
    } finally {
      subscriptionInProgress = false;
    }
  }

  return null;
}

// 알림 허용 배너 (로그인 후 처음 한 번)
export function PushBanner() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const chatTheme = usePreferencesStore((s) => s.chatTheme);
  const naverDark = usePreferencesStore((s) => s.naverDark);
  const oyDark = usePreferencesStore((s) => s.oyDark);
  const [show, setShow] = useState(false);

  // 테마별 스타일 계산
  const bannerStyle = (() => {
    if (chatTheme === 'oliveyoung') {
      return oyDark
        ? { bg: '#0F2222', border: '#1A3030', text: '#E0E8E8', accent: '#00C4B4', accentText: '#fff', muted: '#5A8888', shadow: 'rgba(0,0,0,0.5)', icon: '🌿' }
        : { bg: '#ffffff', border: '#EEF0F0', text: '#1A1A1A', accent: '#00C4B4', accentText: '#fff', muted: '#888888', shadow: 'rgba(0,196,180,0.15)', icon: '🌿' };
    }
    if (chatTheme === 'naver') {
      return naverDark
        ? { bg: '#1c1c1c', border: '#2e2e2e', text: '#e0e0e0', accent: '#03C75A', accentText: '#fff', muted: '#666666', shadow: 'rgba(0,0,0,0.5)', icon: '💬' }
        : { bg: '#ffffff', border: '#e8e8e8', text: '#111111', accent: '#03C75A', accentText: '#fff', muted: '#888888', shadow: 'rgba(0,0,0,0.12)', icon: '💬' };
    }
    // SLR (Discord 스타일 다크)
    return { bg: '#2b2d31', border: '#3f4349', text: '#dbdee1', accent: '#5865f2', accentText: '#fff', muted: '#6d6f78', shadow: 'rgba(0,0,0,0.4)', icon: '🔔' };
  })();

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as Window & { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron) {
      return;
    }
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
      background: bannerStyle.bg,
      border: `1px solid ${bannerStyle.border}`,
      borderRadius: 14,
      padding: '13px 18px',
      display: 'flex', alignItems: 'center', gap: 10,
      zIndex: 9998,
      color: bannerStyle.text,
      fontSize: 13,
      whiteSpace: 'nowrap',
      boxShadow: `0 4px 20px ${bannerStyle.shadow}`,
      maxWidth: 'calc(100vw - 32px)',
    }}>
      <span style={{ fontSize: 18 }}>{bannerStyle.icon}</span>
      <span style={{ fontWeight: 600 }}>새 메시지 알림을 받으시겠습니까?</span>
      <button onClick={allow}
        style={{ background: bannerStyle.accent, color: bannerStyle.accentText, border: 'none', borderRadius: 20, padding: '5px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
        허용
      </button>
      <button onClick={() => setShow(false)}
        style={{ background: 'transparent', color: bannerStyle.muted, border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, flexShrink: 0, padding: '0 2px' }}>
        ×
      </button>
    </div>
  );
}
