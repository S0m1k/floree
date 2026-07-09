'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  customerId: string;
  balance: number;
}

// «Бонусы» на вкладке Бонусы карточки клиента: значение с карандашом; клик →
// инлайн-инпут → PATCH /admin/api/customers/[id] { bonusBalance }. Backend
// пишет дельту в историю списаний/начислений (comment «Корректировка»).
export default function BonusBalanceEditor({ customerId, balance }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(balance));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const next = parseInt(value, 10);
    if (Number.isNaN(next) || next < 0) {
      setError('Введите неотрицательное число');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: 'customers', attributes: { bonusBalance: next } } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось изменить бонусы');
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <span className="admin-bonus-editor">
        <strong>{balance}</strong>
        <button
          type="button"
          className="admin-bonus-editor__pencil"
          onClick={() => { setValue(String(balance)); setEditing(true); }}
          aria-label="Изменить бонусы"
          title="Изменить бонусы"
        >
          ✎
        </button>
      </span>
    );
  }

  return (
    <span className="admin-bonus-editor">
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
        disabled={busy}
        autoFocus
        aria-label="Новый баланс бонусов"
      />
      <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={busy}>
        {busy ? '…' : 'ОК'}
      </button>
      <button type="button" className="admin-btn" onClick={() => setEditing(false)} disabled={busy}>
        Отмена
      </button>
      {error && <span className="admin-status-control__error">{error}</span>}
    </span>
  );
}
