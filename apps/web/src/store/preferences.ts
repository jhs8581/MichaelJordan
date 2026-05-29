import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ChatTheme = 'slr' | 'naver';

interface PreferencesState {
  chatTheme: ChatTheme;
  setChatTheme: (theme: ChatTheme) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      chatTheme: 'slr',
      setChatTheme: (chatTheme) => set({ chatTheme }),
    }),
    { name: 'chat-preferences' }
  )
);
