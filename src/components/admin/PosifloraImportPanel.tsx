'use client';

import { useEffect, useRef, useState } from 'react';

interface PosifloraSettings {
  baseUrl: string | null;
  username: string | null;
  hasPassword: boolean;
}

interface ImportRunInfo {
  status: 'running' | 'done' | 'error';
  log: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

// «Импорт из Posiflora»: доступы + одна кнопка. Пока идёт импорт, статус
// поллится и лог обновляется на глазах.
export default function PosifloraImportPanel({
  settings,
  lastRun,
}: {
  settings: PosifloraSettings | null;
  lastRun: ImportRunInfo | null;
}) {
  const [baseUrl, setBaseUrl] = useState(settings?.baseUrl || '');
  const [username, setUsername] = useState(settings?.username || '');
  const [password, setPassword] = useState('');
  const [savedNote, setSavedNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<ImportRunInfo | null>(lastRun);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRunning = run?.status === 'running';

  useEffect(() => {
    if (!isRunning) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/admin/api/posiflora-import/status');
        const json = await res.json();
        if (json.data) setRun(json.data.attributes);
      } catch {
        /* сеть мигнула — следующий тик */
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isRunning]);

  const saveSettings = async () => {
    setBusy(true);
    setError(null);
    setSavedNote(false);
    try {
      const res = await fetch('/admin/api/posiflora-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            attributes: {
              baseUrl: baseUrl.trim(),
              username: username.trim(),
              password: password.trim() || undefined,
            },
          },
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Не удалось сохранить');
      setPassword('');
      setSavedNote(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  const startImport = async () => {
    if (!window.confirm('Запустить полный импорт из Posiflora? Существующие записи будут обновлены, ничего не удаляется.')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/admin/api/posiflora-import/run', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Не удалось запустить импорт');
      setRun({ status: 'running', log: 'запуск…', error: null, startedAt: null, finishedAt: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось запустить импорт');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="admin-panel admin-dict-form" style={{ marginBottom: 24 }}>
        <p className="admin-panel__title">Доступы Posiflora</p>
        <p className="admin-form-note">
          Логин и пароль аккаунта Posiflora, из которого переносим данные. Для Floree
          заполнены автоматически.
        </p>
        <div className="admin-form-grid" style={{ maxWidth: 560 }}>
          <label className="admin-field">
            <span className="admin-field__label">Адрес (https://магазин.posiflora.com)</span>
            <input className="admin-input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} autoComplete="off" />
          </label>
          <label className="admin-field">
            <span className="admin-field__label">Логин</span>
            <input className="admin-input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
          </label>
          <label className="admin-field">
            <span className="admin-field__label">
              Пароль {settings?.hasPassword ? '(задан — пусто = не менять)' : '(не задан)'}
            </span>
            <input
              className="admin-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={settings?.hasPassword ? '••••••••' : ''}
              autoComplete="new-password"
            />
          </label>
        </div>
        {savedNote && <p className="admin-form-note" style={{ color: 'var(--admin-accent)' }}>Сохранено</p>}
        <div className="admin-form-actions admin-dict-form__actions">
          <button type="button" className="admin-btn" onClick={saveSettings} disabled={busy || isRunning}>
            Сохранить доступы
          </button>
          <button type="button" className="admin-btn admin-btn--primary" onClick={startImport} disabled={busy || isRunning}>
            {isRunning ? 'Импорт выполняется…' : 'Запустить импорт'}
          </button>
        </div>
        {error && <div className="admin-form-error admin-dict-error">{error}</div>}
      </div>

      <div className="admin-panel admin-dict-form">
        <p className="admin-panel__title">
          Последний запуск{' '}
          {run
            ? run.status === 'running'
              ? '— выполняется'
              : run.status === 'done'
                ? '— завершён'
                : '— ошибка'
            : '— ещё не запускался'}
        </p>
        {run?.log && (
          <pre
            style={{
              background: 'var(--admin-bg)', padding: 16, fontSize: 13,
              whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto', margin: 0,
            }}
          >
            {run.log}
          </pre>
        )}
        {run?.error && <div className="admin-form-error admin-dict-error">{run.error}</div>}
      </div>
    </div>
  );
}
