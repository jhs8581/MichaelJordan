'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ password: '', username: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/register', form);
      router.push('/login');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        '회원가입 중 오류가 발생했습니다.';
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
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#fff' }}>회원가입</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>계정을 만들어 시작하세요</p>
        </div>

        {error && <p className="mb-4 rounded-lg p-3 text-sm" style={{ background: '#ed4245', color: '#fff' }}>{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {(['username', 'password'] as const).map((field) => (
            <div key={field}>
              <label className="block text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--text-muted)' }}>
                {field === 'username' ? '닉네임' : '비밀번호'}
              </label>
              <input
                type={field === 'password' ? 'password' : 'text'}
                name={field}
                value={form[field]}
                onChange={handleChange}
                required
                className="w-full rounded-md px-3 py-2.5 text-sm outline-none"
                style={{ background: '#1e1f22', color: '#fff', border: '2px solid transparent' }}
                onFocus={(e) => (e.target.style.borderColor = '#5865f2')}
                onBlur={(e) => (e.target.style.borderColor = 'transparent')}
              />
            </div>
          ))}
          <button type="submit" disabled={loading}
            className="w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-60 transition-opacity hover:opacity-90"
            style={{ background: '#5865f2', color: '#fff' }}>
            {loading ? '처리 중...' : '가입하기'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          이미 계정이 있으신가요?{' '}
          <a href="/login" style={{ color: '#00aff4' }} className="hover:underline">로그인</a>
        </p>
      </div>
    </div>
  );
}
