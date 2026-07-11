'use client';

import { useState } from 'react';
import { fmtMoney } from '@/lib/format';

interface Props {
  orderId: string;
  toPay: number;
  onClose: () => void;
  onAdded: () => void;
}

const METHODS: { value: string; label: string }[] = [
  { value: 'cash', label: 'Наличные' },
  { value: 'card', label: 'Карта' },
  { value: 'sbp', label: 'СБП' },
  { value: 'transfer', label: 'Перевод' },
];

// «Добавить аванс» — small modal form (admin-map §2.2.1): payment method +
// amount. The backend re-validates the amount against «К оплате».
export default function AddAdvanceForm({ orderId, toPay, onClose, onAdded }: Props) {
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { setError('Сумма должна быть больше нуля'); return; }
    if (value > toPay) { setError(`Аванс не может превышать сумму к оплате (${fmtMoney(toPay)})`); return; }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/orders/${orderId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, amount: value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось добавить аванс');
      }
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Добавить аванс">
      <form className="admin-modal admin-modal--small" onSubmit={submit}>
        <div className="admin-modal__head">
          <p className="admin-modal__title">Добавить аванс</p>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        <div className="admin-modal__body">
          <div className="admin-field">
            <label htmlFor="advance-method">Способ оплаты</label>
            <select id="advance-method" value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="advance-amount">Сумма, ₽</label>
            <input
              id="advance-amount"
              type="number"
              min="1"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`До ${fmtMoney(toPay)}`}
            />
          </div>
          {error && <div className="admin-form-error">{error}</div>}
          <div className="admin-form-actions">
            <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>Отмена</button>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={busy}>
              {busy ? 'Сохраняем…' : 'Добавить аванс'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
