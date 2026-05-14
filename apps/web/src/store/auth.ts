import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@chat/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  setAuth: (payload: { accessToken: string; refreshToken: string; user: User }) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setAuth: ({ accessToken, refreshToken, user }) =>
        set({ accessToken, refreshToken, user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'chat-auth' }
  )
);
