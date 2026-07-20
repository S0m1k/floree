'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const DEFAULT_LANDING = '/admin/retail-stores';

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Не удалось войти');
        setLoading(false);
        return;
      }
      // Cookies are set on the response; navigate into the admin and refresh so
      // server components re-render with the new session.
      router.replace(DEFAULT_LANDING);
      router.refresh();
    } catch {
      setError('Сервис недоступен. Попробуйте позже.');
      setLoading(false);
    }
  }

  return (
    <form className="admin-login__form" onSubmit={onSubmit} noValidate>
      <div className="admin-login__field">
        <label htmlFor="admin-login-username">Логин</label>
        <input
          id="admin-login-username"
          name="username"
          type="text"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div className="admin-login__field">
        <label htmlFor="admin-login-password">Пароль</label>
        <input
          id="admin-login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <p className="admin-login__error" role="alert">
          {error}
        </p>
      )}
      <button className="admin-login__submit" type="submit" disabled={loading}>
        {loading ? 'Вход…' : 'Войти'}
      </button>
    </form>
  );
}
