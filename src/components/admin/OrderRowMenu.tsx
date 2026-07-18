'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { STATUS_TABS, TERMINAL_STATUSES } from '@/lib/orderStatus';
import OrderStatusBadge from './OrderStatusBadge';

const STATUS_OPTIONS = STATUS_TABS.filter((t) => t.value);

interface Props {
  orderId: string;
  status: string;
}

// ⋮ row menu on the «Заказы» table (admin-map §2.2.1): «Открыть карточку»,
// «Сменить статус» (submenu, PATCH /v1/orders/{id} — same endpoint the order
// card's status badge already uses). Terminal orders (completed/cancelled/
// return) can't change status, so that item is disabled there, same as the
// card.
export default function OrderRowMenu({ orderId, status }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTerminal = TERMINAL_STATUSES.includes(status);

  const close = () => {
    setOpen(false);
    setStatusMenuOpen(false);
  };

  const changeStatus = async (next: string) => {
    if (next === status) { close(); return; }
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
      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-row-menu">
      <button
        type="button"
        className="admin-btn admin-row-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Действия"
      >
        ⋮
      </button>

      {open && !statusMenuOpen && (
        <ul className="admin-row-menu__list" role="menu">
          <li role="menuitem">
            <button
              type="button"
              className="admin-row-menu__item"
              onClick={() => { close(); router.push(`/admin/orders/${orderId}`); }}
            >
              Открыть карточку
            </button>
          </li>
          <li role="menuitem">
            <button
              type="button"
              className="admin-row-menu__item"
              onClick={() => setStatusMenuOpen(true)}
              disabled={isTerminal}
              title={isTerminal ? 'Финальный статус — изменить нельзя' : undefined}
            >
              Сменить статус
            </button>
          </li>
        </ul>
      )}

      {open && statusMenuOpen && (
        <ul className="admin-row-menu__list" role="menu" style={{ minWidth: 180 }}>
          <li role="menuitem">
            <button type="button" className="admin-row-menu__item" onClick={() => setStatusMenuOpen(false)} disabled={busy}>
              ← Назад
            </button>
          </li>
          {STATUS_OPTIONS.map((opt) => (
            <li role="menuitem" key={opt.value}>
              <button
                type="button"
                className="admin-row-menu__item"
                onClick={() => changeStatus(opt.value)}
                disabled={busy || opt.value === status}
              >
                <OrderStatusBadge status={opt.value} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <span className="admin-row-menu__error">{error}</span>}
    </div>
  );
}
