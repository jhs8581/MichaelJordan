'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState('');

  // 이미 로그인된 상태면 채팅으로 바로 이동
  useEffect(() => {
    const check = () => {
      if (useAuthStore.persist.hasHydrated() && useAuthStore.getState().accessToken) {
        router.replace('/chat');
      }
    };
    check();
    const unsub = useAuthStore.persist.onFinishHydration(check);
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { username, password });
      const { accessToken, refreshToken, user } = res.data.data;
      setAuth({ accessToken, refreshToken, user });
      router.push('/chat');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        '로그인 중 오류가 발생했습니다.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: '#1e1f22' }}>
      <div className="w-full max-w-xs p-6" style={{ color: '#fff' }}>
        <h1 className="text-xl font-bold mb-5" style={{ color: '#fff' }}>마이클조던</h1>

        {error && <p className="mb-3 text-sm" style={{ color: '#ed4245' }}>{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: '#b5bac1' }}>닉네임</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              required autoFocus
              className="w-full rounded px-3 py-2 text-sm outline-none"
              style={{ background: '#2b2d31', color: '#fff', border: '1px solid #3f4349' }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: '#b5bac1' }}>비밀번호</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded px-3 py-2 text-sm outline-none"
              style={{ background: '#2b2d31', color: '#fff', border: '1px solid #3f4349' }}
            />
          </div>
          <button type="submit" disabled={loading}
            className="w-full rounded py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: '#5865f2', color: '#fff' }}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="mt-4 text-xs" style={{ color: '#6d6f78' }}>
          계정 없으면 <a href="/register" style={{ color: '#00aff4' }}>회원가입</a>
        </p>
      </div>
    </div>
  );
}
