'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { STATUS_TABS, TERMINAL_STATUSES } from '@/lib/orderStatus';
import OrderStatusBadge from './OrderStatusBadge';

const STATUS_OPTIONS = STATUS_TABS.filter((t) => t.value);

// Clickable status badge on the order card: opens a dropdown of the other
// statuses and PATCHes the choice. Terminal orders (completed/cancelled/return)
// are read-only, so the badge is inert — matches Posiflora (admin-map §2.2.1).
export default function OrderStatusControl({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTerminal = TERMINAL_STATUSES.includes(status);

  if (isTerminal) {
    return <OrderStatusBadge status={status} />;
  }

  const change = async (next: string) => {
    if (next === status) { setOpen(false); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: 'orders', attributes: { status: next } } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось сменить статус');
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-status-control">
      <button
        type="button"
        className="admin-status-control__trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <OrderStatusBadge status={status} />
        <span className="admin-status-control__caret" aria-hidden>▾</span>
      </button>

      {open && (
        <ul className="admin-status-control__menu" role="listbox">
          {STATUS_OPTIONS.map((opt) => (
            <li key={opt.value} role="option" aria-selected={opt.value === status}>
              <button
                type="button"
                className={`admin-status-control__item ${opt.value === status ? 'is-current' : ''}`}
                onClick={() => change(opt.value)}
                disabled={busy}
              >
                <OrderStatusBadge status={opt.value} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <span className="admin-status-control__error">{error}</span>}
    </div>
  );
}
