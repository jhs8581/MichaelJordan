import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ChatTheme = 'slr' | 'naver';

interface PreferencesState {
  chatTheme: ChatTheme;
  setChatTheme: (theme: ChatTheme) => void;
  naverDark: boolean;
  setNaverDark: (dark: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      chatTheme: 'slr',
      setChatTheme: (chatTheme) => set({ chatTheme }),
      naverDark: false,
      setNaverDark: (naverDark: boolean) => set({ naverDark }),
    }),
    { name: 'chat-preferences' }
  )
);
