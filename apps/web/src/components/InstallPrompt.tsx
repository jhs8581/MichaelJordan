'use client';

import { useEffect, useState } from 'react';
import { usePreferencesStore } from '@/store/preferences';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const chatTheme = usePreferencesStore((s) => s.chatTheme);
  const naverDark = usePreferencesStore((s) => s.naverDark);
  const oyDark = usePreferencesStore((s) => s.oyDark);

  const bannerStyle = (() => {
    if (chatTheme === 'oliveyoung') {
      return oyDark
        ? { bg: '#0F2222', border: '#1A3030', text: '#E0E8E8', accent: '#00C4B4', accentText: '#fff', muted: '#5A8888', shadow: 'rgba(0,0,0,0.5)', icon: '🌿' }
        : { bg: '#ffffff', border: '#EEF0F0', text: '#1A1A1A', accent: '#00C4B4', accentText: '#fff', muted: '#888888', shadow: 'rgba(0,196,180,0.15)', icon: '🌿' };
    }
    if (chatTheme === 'naver') {
      return naverDark
        ? { bg: '#1c1c1c', border: '#2e2e2e', text: '#e0e0e0', accent: '#03C75A', accentText: '#fff', muted: '#666666', shadow: 'rgba(0,0,0,0.5)', icon: '📲' }
        : { bg: '#ffffff', border: '#e8e8e8', text: '#111111', accent: '#03C75A', accentText: '#fff', muted: '#888888', shadow: 'rgba(0,0,0,0.12)', icon: '📲' };
    }
    return { bg: '#2b2d31', border: '#3f4349', text: '#dbdee1', accent: '#5865f2', accentText: '#fff', muted: '#6d6f78', shadow: 'rgba(0,0,0,0.4)', icon: '📲' };
  })();

  useEffect(() => {
    // 서비스 워커 등록
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        registration.update().catch(() => {});

        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;
          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              installingWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        let refreshed = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshed) return;
          refreshed = true;
          window.location.reload();
        });
      }).catch(() => {});
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: bannerStyle.bg,
      border: `1px solid ${bannerStyle.border}`,
      borderRadius: 14,
      padding: '13px 18px',
      display: 'flex', alignItems: 'center', gap: 10,
      zIndex: 9999,
      color: bannerStyle.text,
      fontSize: 13,
      whiteSpace: 'nowrap',
      boxShadow: `0 4px 20px ${bannerStyle.shadow}`,
      maxWidth: 'calc(100vw - 32px)',
    }}>
      <span style={{ fontSize: 18 }}>{bannerStyle.icon}</span>
      <span style={{ fontWeight: 600 }}>앱을 설치하시겠습니까?</span>
      <button
        onClick={async () => {
          await deferredPrompt.prompt();
          setDeferredPrompt(null);
        }}
        style={{ background: bannerStyle.accent, color: bannerStyle.accentText, border: 'none', borderRadius: 20, padding: '5px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700, flexShrink: 0 }}
      >설치</button>
      <button
        onClick={() => setDeferredPrompt(null)}
        style={{ background: 'transparent', color: bannerStyle.muted, border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, flexShrink: 0, padding: '0 2px' }}
      >×</button>
    </div>
  );
}
