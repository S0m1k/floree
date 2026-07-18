import Link from 'next/link';
import { getCustomers, getCustomerSources, buildCustomersHref, PAGE_SIZE, CustomersSearchParams } from '@/lib/adminCustomers';
import CustomerActionsMenu from '@/components/admin/CustomerActionsMenu';
import CustomersNav from '@/components/admin/CustomersNav';

export const metadata = { title: 'Клиенты' };

const fmtMoney = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU');
};

interface Props {
  searchParams: CustomersSearchParams;
}

export default async function AdminCustomersPage({ searchParams }: Props) {
  const [{ customers, total }, sources] = await Promise.all([
    getCustomers(searchParams),
    getCustomerSources(),
  ]);

  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <CustomersNav active="/admin/customers" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <h1 className="admin-title" style={{ margin: 0 }}>Клиенты</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="admin-btn" disabled title="Скоро">Экспорт клиентов</button>
          <Link href="/admin/customers/create" className="admin-btn admin-btn--primary">Создать нового</Link>
        </div>
      </div>

      <form method="GET" action="/admin/customers" className="admin-search">
        {Object.entries(searchParams)
          .filter(([key]) => key !== 'q' && key !== 'page')
          .map(([key, value]) => value && <input key={key} type="hidden" name={key} value={value} />)}
        <input type="text" name="q" defaultValue={searchParams.q || ''} placeholder="Имя, номер, телефон…" />
        <button type="submit" className="admin-btn admin-btn--primary">Найти</button>
      </form>

      <div className="admin-layout">
        <form method="GET" action="/admin/customers" className="admin-panel">
          {searchParams.q && <input type="hidden" name="q" value={searchParams.q} />}
          <p className="admin-panel__title">Фильтр клиентов</p>

          <div className="admin-filter-actions">
            <button type="submit" className="admin-btn admin-btn--primary">Применить фильтр</button>
            <a href="/admin/customers" className="admin-btn admin-btn--outline-blue">Сбросить фильтры</a>
          </div>

          <div className="admin-field">
            <label htmlFor="source">Откуда узнал о нас</label>
            <select id="source" name="source" defaultValue={searchParams.source || ''}>
              <option value="">Все источники</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{s.attributes.title}</option>
              ))}
            </select>
          </div>

          <div className="admin-field">
            <label htmlFor="gender">Пол</label>
            <select id="gender" name="gender" defaultValue={searchParams.gender || ''}>
              <option value="">Все</option>
              <option value="male">Мужской</option>
              <option value="female">Женский</option>
            </select>
          </div>

          <div className="admin-field">
            <label htmlFor="registeredFrom">Дата регистрации</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" id="registeredFrom" name="registeredFrom" defaultValue={searchParams.registeredFrom || ''} />
              <input type="date" name="registeredTo" defaultValue={searchParams.registeredTo || ''} />
            </div>
          </div>
          <div style={{ height: 8 }} />
        </form>

        <div>
          {customers.length === 0 ? (
            <div className="admin-table-wrap">
              <div className="admin-empty">Клиенты не найдены — попробуйте изменить фильтры.</div>
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Имя</th>
                    <th>Телефон</th>
                    <th>Средний чек</th>
                    <th>Заказов на сумму</th>
                    <th>Бонусы</th>
                    <th>Дата рождения</th>
                    <th aria-label="Действия" />
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => {
                    const a = c.attributes;
                    return (
                      <tr key={c.id}>
                        <td><Link href={`/admin/customers/${c.id}`}>{a.title || 'Без имени'}</Link></td>
                        <td>{a.phone}</td>
                        <td>{a.ordersQty > 0 ? fmtMoney(a.averageCheck) : '—'}</td>
                        <td>{a.ordersQty > 0 ? `${fmtMoney(a.ordersAmount)} (${a.ordersQty})` : '—'}</td>
                        <td>{a.currentPoints}</td>
                        <td>{fmtDate(a.birthday)}</td>
                        <td style={{ width: 48 }}>
                          <CustomerActionsMenu editHref={`/admin/customers/${c.id}/edit`} showDelete={false} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="admin-pagination">
                <span>Найдено клиентов: {total}</span>
                <div className="admin-pagination__pages">
                  {Array.from({ length: pageCount }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2)
                    .map((p, idx, arr) => (
                      <span key={p} style={{ display: 'flex', alignItems: 'center' }}>
                        {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ padding: '0 2px' }}>…</span>}
                        {p === page ? (
                          <span className="admin-pagination__current">{p}</span>
                        ) : (
                          <Link href={buildCustomersHref(searchParams, { page: String(p) })}>{p}</Link>
                        )}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
