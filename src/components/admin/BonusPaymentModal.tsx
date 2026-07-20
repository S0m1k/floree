'use client';

import { useState } from 'react';
import { fmtQty } from '@/lib/format';

interface Props {
  orderId: string;
  // Customer's current bonus balance (already excludes any bonuses already
  // spent on this order — that spend is added back below to get the true
  // ceiling for a *replacement* amount).
  balance: number;
  currentBonusPaid: number;
  toPay: number;
  onClose: () => void;
  onSaved: () => void;
}

// «Оплата бонусами» (admin-map §2.2.1, итоговая панель). 1 бонус == 1 рубль.
// The backend re-validates against the customer's balance and «К оплате»;
// this modal's max is the same formula, shown as a hint.
export default function BonusPaymentModal({
  orderId, balance, currentBonusPaid, toPay, onClose, onSaved,
}: Props) {
  const [amount, setAmount] = useState(currentBonusPaid > 0 ? String(currentBonusPaid) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxAvailable = Math.min(balance + currentBonusPaid, toPay + currentBonusPaid);

  const submit = async (value: number) => {
    if (!Number.isFinite(value) || value < 0) { setError('Сумма должна быть неотрицательной'); return; }
    if (value > maxAvailable) {
      setError(`Сумма не может превышать ${fmtQty(maxAvailable)} бонусов`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/orders/${orderId}/bonus-payment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось списать бонусы');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Оплата бонусами">
      <form
        className="admin-modal admin-modal--small"
        onSubmit={(e) => { e.preventDefault(); submit(Number(amount)); }}
      >
        <div className="admin-modal__head">
          <p className="admin-modal__title">Оплата бонусами</p>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        <div className="admin-modal__body">
          <div className="admin-field">
            <label htmlFor="bonus-amount">Сумма бонусов</label>
            <input
              id="bonus-amount"
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Доступно ${fmtQty(maxAvailable)} бонусов`}
            />
            <p className="admin-order-note">Доступно {fmtQty(maxAvailable)} бонусов</p>
          </div>
          {error && <div className="admin-form-error">{error}</div>}
          <div className="admin-form-actions">
            <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>Отмена</button>
            {currentBonusPaid > 0 && (
              <button
                type="button"
                className="admin-btn admin-btn--outline-blue"
                onClick={() => submit(0)}
                disabled={busy}
              >
                Снять
              </button>
            )}
            <button type="submit" className="admin-btn admin-btn--primary" disabled={busy}>
              {busy ? 'Сохраняем…' : 'Применить'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
