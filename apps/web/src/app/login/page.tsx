'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState('');
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
      <div className="w-full max-w-sm rounded-xl p-8 shadow-2xl" style={{ background: '#2b2d31' }}>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: '#5865f2' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#fff' }}>로그인</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>계속하려면 로그인하세요</p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg p-3 text-sm" style={{ background: '#ed4245', color: '#fff' }}>{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--text-muted)' }}>닉네임</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required
              className="w-full rounded-md px-3 py-2.5 text-sm outline-none"
              style={{ background: '#1e1f22', color: '#fff', border: '2px solid transparent' }}
              onFocus={(e) => (e.target.style.borderColor = '#5865f2')}
              onBlur={(e) => (e.target.style.borderColor = 'transparent')}
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--text-muted)' }}>비밀번호</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full rounded-md px-3 py-2.5 text-sm outline-none"
              style={{ background: '#1e1f22', color: '#fff', border: '2px solid transparent' }}
              onFocus={(e) => (e.target.style.borderColor = '#5865f2')}
              onBlur={(e) => (e.target.style.borderColor = 'transparent')}
            />
          </div>
          <button type="submit" disabled={loading}
            className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-60 transition-opacity hover:opacity-90 mt-2"
            style={{ background: '#5865f2', color: '#fff' }}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          계정이 없으신가요?{' '}
          <a href="/register" style={{ color: '#00aff4' }} className="hover:underline">회원가입</a>
        </p>
      </div>
    </div>
  );
}
