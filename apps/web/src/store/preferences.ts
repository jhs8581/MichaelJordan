import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';

export type ChatTheme = 'slr' | 'naver' | 'oliveyoung';

interface PreferencesState {
  chatTheme: ChatTheme;
  setChatTheme: (theme: ChatTheme) => Promise<void>;
  naverDark: boolean;
  setNaverDark: (dark: boolean) => void;
  oyDark: boolean;
  setOyDark: (dark: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      chatTheme: 'slr',
      setChatTheme: async (chatTheme) => {
        // 로컬 상태 즉시 업데이트
        set({ chatTheme });
        
        // 서버에 비동기로 저장 (실패해도 로컬은 유지)
        try {
          await api.patch('/users/me/theme', { chatTheme });
          console.log(`[THEME] 테마 변경 저장됨: ${chatTheme}`);
        } catch (err) {
          console.error(`[THEME-ERROR] 테마 저장 실패:`, err);
          // 오류 무시 - 로컬 상태는 유지
        }
      },
      naverDark: false,
      setNaverDark: (naverDark: boolean) => set({ naverDark }),
      oyDark: false,
      setOyDark: (oyDark: boolean) => set({ oyDark }),
    }),
    { name: 'chat-preferences' }
  )
);
