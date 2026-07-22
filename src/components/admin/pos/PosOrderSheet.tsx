'use client';

import { useCallback, useEffect, useState } from 'react';
import { STATUS_TABS, TERMINAL_STATUSES } from '@/lib/orderStatus';
import { fmtMoney } from './PosTerminal';

interface OrderDetail {
  docNo: string;
  status: string;
  customer: string;
  phone: string;
  address: string;
  comment: string;
  totalAmount: number;
  paymentsAmount: number;
  items: { id: string; title: string; qty: number; sum: number }[];
}

interface Props {
  orderId: string;
  onClose: () => void;
  onChanged: () => void;
}

const STATUS_OPTIONS = STATUS_TABS.filter((t) => t.value);

// Карточка заказа в терминале: состав, клиент, суммы и смена статуса крупными
// кнопками — рабочий цикл флориста (Собран → У курьера → Завершён) без ухода
// в десктопную админку.
export default function PosOrderSheet({ orderId, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/admin/api/pos/orders/${orderId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Не удалось загрузить заказ');
      const a = json.order?.attributes || {};
      setDetail({
        docNo: a.docNo || orderId.slice(0, 8),
        status: a.status,
        customer: a.deliveryContact || '',
        phone: a.deliveryPhoneNumber || '',
        address: [a.deliveryCity, a.deliveryStreet, a.deliveryHouse].filter(Boolean).join(', '),
        comment: a.description || '',
        totalAmount: Number(a.totalAmount) || 0,
        paymentsAmount: Number(a.paymentsAmount) || 0,
        items: (json.items || [])
          .filter((it: any) => !it.relationships?.parent?.data)
          .map((it: any) => ({
            id: it.id,
            title: it.attributes.title,
            qty: Number(it.attributes.quantity) || 1,
            sum: Number(it.attributes.sum ?? it.attributes.total ?? 0)
              || (Number(it.attributes.unitPrice) || 0) * (Number(it.attributes.quantity) || 1),
          })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (next: string) => {
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
      setStatusOpen(false);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const acceptPayment = async (method: 'cash' | 'card') => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/pos/orders/${orderId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось принять оплату');
      }
      setPayOpen(false);
      const fiscal = json.meta?.fiscal;
      setNotice(
        fiscal?.status === 'failed'
          ? `Оплата принята, но чек НЕ пробит: ${fiscal.error || 'касса недоступна'}`
          : 'Оплата принята',
      );
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const isTerminal = detail ? TERMINAL_STATUSES.includes(detail.status) : false;
  const statusLabel = STATUS_OPTIONS.find((s) => s.value === detail?.status)?.label || detail?.status;
  const due = detail ? detail.totalAmount - detail.paymentsAmount : 0;

  return (
    <div className="pos-modal" role="dialog" aria-modal="true" aria-label="Заказ">
      <div className="pos-modal__card pos-order-sheet">
        {detail === null && !error && <div className="pos__empty">Загрузка…</div>}
        {error && <div className="pos__error" onClick={() => setError(null)}>{error}</div>}

        {detail && (
          <>
            <div className="pos-order-sheet__head">
              <h2>Заказ № {detail.docNo}</h2>
              <button
                type="button"
                className={`pos__order-status pos__order-status--${detail.status}`}
                onClick={() => !isTerminal && setStatusOpen((v) => !v)}
                disabled={isTerminal || busy}
                title={isTerminal ? 'Финальный статус — изменить нельзя' : 'Сменить статус'}
              >
                {statusLabel} {!isTerminal && '▾'}
              </button>
            </div>

            {statusOpen && (
              <div className="pos-order-sheet__statuses">
                {STATUS_OPTIONS.filter((s) => s.value !== detail.status).map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className="admin-btn"
                    disabled={busy}
                    onClick={() => changeStatus(s.value)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {(detail.customer || detail.phone) && (
              <div className="pos-order-sheet__row">
                <span>{detail.customer || 'Клиент'}</span>
                {detail.phone && <a href={`tel:+7${detail.phone}`}>+7{detail.phone}</a>}
              </div>
            )}
            {detail.address && <div className="pos-order-sheet__muted">{detail.address}</div>}
            {detail.comment && <div className="pos-order-sheet__muted">«{detail.comment}»</div>}

            {detail.items.length > 0 && (
              <ul className="pos-order-sheet__items">
                {detail.items.map((it) => (
                  <li key={it.id}>
                    <span>{it.title}{it.qty !== 1 ? ` × ${it.qty}` : ''}</span>
                    <span>{it.sum ? fmtMoney(it.sum) : ''}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="pos-order-sheet__row pos-order-sheet__total">
              <span>Итого</span>
              <strong>{fmtMoney(detail.totalAmount)}</strong>
            </div>
            {due > 0 && (
              <div className="pos-order-sheet__row pos-order-sheet__due">
                <span>К оплате</span>
                <strong>{fmtMoney(due)}</strong>
              </div>
            )}
            {notice && (
              <div className="pos__notice" onClick={() => setNotice(null)}>{notice}</div>
            )}
            {due > 0 && !payOpen && (
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={() => setPayOpen(true)}
                disabled={busy}
              >
                Принять оплату {fmtMoney(due)}
              </button>
            )}
            {due > 0 && payOpen && (
              <div className="pos-order-sheet__statuses">
                <button type="button" className="admin-btn" disabled={busy} onClick={() => acceptPayment('cash')}>
                  Наличные
                </button>
                <button type="button" className="admin-btn" disabled={busy} onClick={() => acceptPayment('card')}>
                  Карта
                </button>
              </div>
            )}
          </>
        )}

        <div className="pos-modal__actions">
          <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
