'use client';

import { useMemo, useState } from 'react';
import type { CartLine } from './PosTerminal';

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n * 100) / 100) + ' ₽';

interface Props {
  storeId: string;
  cart: CartLine[];
  total: number;
  onClose: () => void;
  onSold: (change: number | null) => void;
}

// Модал оплаты: нал (с подсказкой сдачи) или карта. Сервер сам считает сумму
// по каталогу — total здесь только для отображения.
export default function PosPaymentModal({ storeId, cart, total, onClose, onSold }: Props) {
  const [method, setMethod] = useState<'cash' | 'card'>('cash');
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = useMemo(() => {
    const r = Number(received);
    return method === 'cash' && received !== '' && r >= total ? r - total : null;
  }, [method, received, total]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const payment: Record<string, unknown> = { method };
      if (method === 'cash' && received !== '') payment.cashReceived = Number(received);
      const res = await fetch('/admin/api/pos/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          items: cart.map((l) =>
            l.kind === 'bouquet' ? { bouquetId: l.id } : { inventoryItemId: l.id, quantity: l.qty },
          ),
          payment,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось провести продажу');
      }
      onSold(typeof json.meta?.change === 'number' ? json.meta.change : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
      setBusy(false);
    }
  };

  return (
    <div className="pos-modal" role="dialog" aria-modal="true" aria-label="Оплата">
      <div className="pos-modal__card">
        <h2>Оплата — {fmt(total)}</h2>

        <div className="pos-modal__methods">
          <button
            type="button"
            className={`admin-chip ${method === 'cash' ? 'admin-chip--active' : ''}`}
            onClick={() => setMethod('cash')}
          >
            Наличные
          </button>
          <button
            type="button"
            className={`admin-chip ${method === 'card' ? 'admin-chip--active' : ''}`}
            onClick={() => setMethod('card')}
          >
            Карта
          </button>
        </div>

        {method === 'cash' && (
          <div className="pos-modal__cash">
            <input
              type="number"
              min={0}
              placeholder="Получено, ₽"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              autoFocus
            />
            {change != null && <span className="pos-modal__change">Сдача: <strong>{fmt(change)}</strong></span>}
          </div>
        )}

        {error && <div className="pos__error">{error}</div>}

        <div className="pos-modal__actions">
          <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={submit}
            disabled={busy || (method === 'cash' && received !== '' && Number(received) < total)}
          >
            {busy ? 'Проводим…' : 'Провести продажу'}
          </button>
        </div>
      </div>
    </div>
  );
}
