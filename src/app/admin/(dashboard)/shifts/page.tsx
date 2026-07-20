import Link from 'next/link';
import { getShifts, STAFF_PAGE_SIZE, ShiftsSearchParams } from '@/lib/adminStaff';
import { getStores, getWorkers } from '@/lib/adminOrders';
import { Worker } from '@/types';
import StaffNav from '@/components/admin/StaffNav';

export const metadata = { title: 'Рабочие смены' };

const fmtMoney = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';

const fmtDateTime = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

interface Props {
  searchParams: ShiftsSearchParams;
}

function shiftParty(
  workerId: string | undefined,
  at: string | null,
  workersById: Record<string, Worker>,
) {
  const name = workerId ? workersById[workerId]?.attributes.name : null;
  const time = fmtDateTime(at);
  if (!name && !time) return '—';
  return (
    <div className="admin-shift-party">
      <span>{name || '—'}</span>
      <span className="admin-shift-party__time">{time || '—'}</span>
    </div>
  );
}

export default async function AdminShiftsPage({ searchParams }: Props) {
  const [{ shifts, total }, stores, workers] = await Promise.all([
    getShifts(searchParams),
    getStores(),
    getWorkers(),
  ]);

  const storesById = Object.fromEntries(stores.map((s) => [s.id, s]));
  const workersById: Record<string, Worker> = Object.fromEntries(workers.map((w) => [w.id, w]));

  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const pageCount = Math.max(1, Math.ceil(total / STAFF_PAGE_SIZE));

  const buildHref = (p: number) => {
    const qs = new URLSearchParams();
    if (searchParams.store) qs.set('store', searchParams.store);
    if (searchParams.worker) qs.set('worker', searchParams.worker);
    if (searchParams.dateFrom) qs.set('dateFrom', searchParams.dateFrom);
    if (searchParams.dateTo) qs.set('dateTo', searchParams.dateTo);
    if (p > 1) qs.set('page', String(p));
    const query = qs.toString();
    return query ? `/admin/shifts?${query}` : '/admin/shifts';
  };

  return (
    <div>
      <StaffNav active="/admin/shifts" />

      <h1 className="admin-title">Рабочие смены</h1>

      <form method="GET" action="/admin/shifts" className="admin-search" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <select name="store" defaultValue={searchParams.store || ''} className="admin-inline-select">
          <option value="">Все точки</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.attributes.title}</option>
          ))}
        </select>
        {/* Device filters mirror the live Posiflora UI but our shifts have no
            device dictionary yet — kept disabled like other stub controls. */}
        <select className="admin-inline-select" disabled title="Пока недоступно">
          <option>Все типы устройств</option>
        </select>
        <select className="admin-inline-select" disabled title="Пока недоступно">
          <option>Все устройства</option>
        </select>
        <select name="worker" defaultValue={searchParams.worker || ''} className="admin-inline-select">
          <option value="">Все сотрудники</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>{w.attributes.name}</option>
          ))}
        </select>
        <input type="date" name="dateFrom" defaultValue={searchParams.dateFrom || ''} className="admin-inline-select" aria-label="Период с" />
        <input type="date" name="dateTo" defaultValue={searchParams.dateTo || ''} className="admin-inline-select" aria-label="Период по" />
        <button type="submit" className="admin-btn admin-btn--primary">Применить</button>
      </form>

      {shifts.length === 0 ? (
        <div className="admin-table-wrap">
          <div className="admin-empty">
            Смены не найдены — кассовые смены появятся здесь после первого открытия смены в POS-приложении.
          </div>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th aria-label="Статус смены" />
                <th>Открытие</th>
                <th>Закрытие</th>
                <th>Устройство</th>
                <th>Точка продаж</th>
                <th>Расхождение при открытии смены</th>
                <th>Расхождение при закр. смены</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => {
                const a = s.attributes;
                const storeId = s.relationships?.store?.data?.id;
                return (
                  <tr key={s.id}>
                    <td>
                      <span
                        className="material-symbols-outlined admin-shift-lock"
                        title={a.closedAt ? 'Смена закрыта' : 'Смена открыта'}
                      >
                        {a.closedAt ? 'lock' : 'lock_open'}
                      </span>
                    </td>
                    <td>{shiftParty(s.relationships?.openedBy?.data?.id, a.openedAt, workersById)}</td>
                    <td>{shiftParty(s.relationships?.closedBy?.data?.id, a.closedAt, workersById)}</td>
                    <td>{a.deviceName || '—'}</td>
                    <td>{storeId ? storesById[storeId]?.attributes.title || '—' : '—'}</td>
                    <td>{fmtMoney(a.openDiscrepancy)}</td>
                    <td>{fmtMoney(a.closeDiscrepancy)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="admin-pagination">
            <span>Найдено смен: {total}</span>
            <div className="admin-pagination__pages">
              {Array.from({ length: pageCount }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2)
                .map((p, idx, arr) => (
                  <span key={p} style={{ display: 'flex', alignItems: 'center' }}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ padding: '0 2px' }}>…</span>}
                    {p === page ? (
                      <span className="admin-pagination__current">{p}</span>
                    ) : (
                      <Link href={buildHref(p)}>{p}</Link>
                    )}
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
