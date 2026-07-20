'use client';

import { useState } from 'react';
import { SimpleDictEntry } from '@/types';
import { fmtMoney } from '@/lib/format';

type Kind = 'discount' | 'markup';
type Target = 'order' | 'item';
type Mode = 'percent' | 'amount';

interface Props {
  orderId: string;
  kind: Kind;
  target: Target;
  itemId?: string;
  // Shown in the title for a per-line discount/markup.
  itemTitle?: string;
  // Prefills the form when reopening an already-set discount/markup.
  currentAmount: number;
  currentPercent: number | null;
  currentReasonId: string | null;
  reasons: SimpleDictEntry[];
  onClose: () => void;
  onSaved: () => void;
}

const KIND_LABEL: Record<Kind, string> = { discount: 'Скидка', markup: 'Надбавка' };

// «Скидка»/«Надбавка» на заказ или на строку состава (admin-map §2.2.1,
// итоговая панель + «Скидка/Надбавка на позицию»). Only kind/target/mode/
// value/reason are sent — the backend computes and caps the resulting money
// amount from the target's own base (memory payment-price-vuln).
export default function DiscountMarkupModal({
  orderId, kind, target, itemId, itemTitle,
  currentAmount, currentPercent, currentReasonId, reasons,
  onClose, onSaved,
}: Props) {
  const [mode, setMode] = useState<Mode>(currentPercent !== null ? 'percent' : 'amount');
  const [value, setValue] = useState(
    currentPercent !== null ? String(currentPercent) : (currentAmount > 0 ? String(currentAmount) : ''),
  );
  const [reasonId, setReasonId] = useState(currentReasonId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = `${KIND_LABEL[kind]}${target === 'item' && itemTitle ? ` — «${itemTitle}»` : ' на заказ'}`;

  const apply = async () => {
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0) { setError('Величина должна быть неотрицательным числом'); return; }
    if (mode === 'percent' && v > 100) { setError('Процент не может быть больше 100'); return; }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/orders/${orderId}/discount`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind, target, itemId, mode, value: v,
          reasonId: reasonId || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось применить');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ target, kind });
      if (target === 'item' && itemId) qs.set('itemId', itemId);
      const res = await fetch(`/admin/api/orders/${orderId}/discount?${qs.toString()}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось снять');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="admin-modal admin-modal--small">
        <div className="admin-modal__head">
          <p className="admin-modal__title">{title}</p>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        <div className="admin-modal__body">
          <div className="admin-chips" style={{ marginBottom: 4 }}>
            {([['percent', '%'], ['amount', '₽']] as [Mode, string][]).map(([m, label]) => (
              <button
                key={m}
                type="button"
                className={`admin-chip ${mode === m ? 'admin-chip--active' : ''}`}
                onClick={() => setMode(m)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="admin-field">
            <label htmlFor="discount-value">Величина{mode === 'percent' ? ', %' : ', ₽'}</label>
            <input
              id="discount-value"
              type="number"
              min="0"
              max={mode === 'percent' ? 100 : undefined}
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label htmlFor="discount-reason">Причина</label>
            <select id="discount-reason" value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
              <option value="">Не указана</option>
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>{r.attributes.title}</option>
              ))}
            </select>
          </div>
          {currentAmount > 0 && (
            <p className="admin-order-note">Сейчас применено: {fmtMoney(currentAmount)}</p>
          )}
          {error && <div className="admin-form-error">{error}</div>}
          <div className="admin-form-actions">
            <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>Отмена</button>
            {currentAmount > 0 && (
              <button type="button" className="admin-btn admin-btn--outline-blue" onClick={remove} disabled={busy}>
                Снять
              </button>
            )}
            <button type="button" className="admin-btn admin-btn--primary" onClick={apply} disabled={busy}>
              {busy ? 'Сохраняем…' : 'Применить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
