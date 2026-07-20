'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { STATUS_TABS } from '@/lib/orderStatus';
import { fmtMoney } from './PosTerminal';

interface PosOrder {
  id: string;
  docNo: string;
  status: string;
  customer: string;
  amount: number;
  createdAt: string | null;
}

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_TABS.filter((t) => t.value).map((t) => [t.value, t.label]),
);

// Порядок групп и «фирменные» цвета заголовков, как в терминале Posiflora.
const GROUP_ORDER = ['new', 'assembled', 'courier', 'completed', 'credit', 'return', 'cancelled'];

const fmtTime = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

interface Props {
  storeId: string;
}

// «Заказы» — заказы точки за выбранный день, сгруппированные по статусам
// (цветные заголовки-группы с счётчиком, как в терминале Posiflora).
export default function PosOrdersTab({ storeId }: Props) {
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [orders, setOrders] = useState<PosOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setOrders(null);
    setError(null);
    try {
      const res = await fetch(
        `/admin/api/pos/orders?store=${encodeURIComponent(storeId)}&date=${date}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Не удалось загрузить заказы');
      const rows: PosOrder[] = (json.data || []).map((o: any) => ({
        id: o.id,
        docNo: o.attributes.docNo || o.id.slice(0, 8),
        status: o.attributes.status,
        customer: o.attributes.deliveryContact || '',
        amount: Number(o.attributes.totalAmount) || 0,
        createdAt: o.attributes.createdAt ?? null,
      }));
      setOrders(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  }, [storeId, date]);

  useEffect(() => { load(); }, [load]);

  const groups = GROUP_ORDER
    .map((status) => ({
      status,
      label: STATUS_LABELS[status] || status,
      rows: (orders || []).filter((o) => o.status === status),
    }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="pos__tab">
      <h1 className="pos__title">Список заказов</h1>
      <input
        type="date"
        className="pos__search"
        value={date}
        onChange={(e) => e.target.value && setDate(e.target.value)}
      />

      {error && <div className="pos__error">{error}</div>}
      {orders === null && !error && <div className="pos__empty">Загрузка…</div>}
      {orders !== null && groups.length === 0 && (
        <div className="pos__empty">Заказов за этот день нет</div>
      )}

      {groups.map((g) => (
        <section key={g.status} className="pos__order-group">
          <button
            type="button"
            className={`pos__order-group-head pos__order-group-head--${g.status}`}
            onClick={() => setCollapsed((c) => ({ ...c, [g.status]: !c[g.status] }))}
          >
            <span>{g.label}</span>
            <span>{collapsed[g.status] ? '▸' : '▾'} {g.rows.length}</span>
          </button>
          {!collapsed[g.status] &&
            g.rows.map((o) => (
              <Link key={o.id} href={`/admin/orders/${o.id}`} className="pos__order-card">
                <div className="pos__order-time">{fmtTime(o.createdAt)}</div>
                {o.customer && <div className="pos__order-customer">{o.customer}</div>}
                <div className="pos__order-amount">{fmtMoney(o.amount)}</div>
                <div className="pos__order-no">№ {o.docNo}</div>
              </Link>
            ))}
        </section>
      ))}
    </div>
  );
}
