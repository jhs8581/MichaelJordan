import axios from 'axios';
import { useAuthStore } from '@/store/auth';

// Vercel 배포: NEXT_PUBLIC_API_URL 미설정 시 rewrites로 같은 도메인 사용
const baseURL = (process.env.NEXT_PUBLIC_API_URL ?? '') + '/api';

export const api = axios.create({
  baseURL,
  withCredentials: true,
});

// 요청 인터셉터: Authorization 헤더 자동 첨부
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 응답 인터셉터: 401 시 토큰 갱신 후 재시도
let isRefreshing = false;
let queue: Array<() => void> = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry) {
      throw error;
    }
    original._retry = true;

    if (isRefreshing) {
      return new Promise((resolve) => {
        queue.push(() => resolve(api(original)));
      });
    }

    isRefreshing = true;
    const refreshToken = useAuthStore.getState().refreshToken;

    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/refresh`, {
        refreshToken,
      });
      const { accessToken, refreshToken: newRefresh } = res.data.data;
      useAuthStore.getState().setAuth({
        accessToken,
        refreshToken: newRefresh,
        user: useAuthStore.getState().user!,
      });
      queue.forEach((fn) => fn());
      queue = [];
      return api(original);
    } catch {
      useAuthStore.getState().clear();
      window.location.href = '/login';
      throw error;
    } finally {
      isRefreshing = false;
    }
  }
);
