import Link from 'next/link';
import {
  getCustomers, getCustomerSources, getCustomerPreferences, CustomersSearchParams,
} from '@/lib/adminCustomers';
import CustomersTable from '@/components/admin/CustomersTable';

export const metadata = { title: 'Клиенты' };

interface Props {
  searchParams: CustomersSearchParams;
}

// Query string for the CSV export link — the same filters the list itself is
// showing, so «Экспорт клиентов» always matches the current selection.
function exportHref(searchParams: CustomersSearchParams): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value && key !== 'page') qs.set(key, value);
  }
  const query = qs.toString();
  return `/admin/api/customers/export${query ? `?${query}` : ''}`;
}

export default async function AdminCustomersPage({ searchParams }: Props) {
  const [{ customers, total }, sources, preferences] = await Promise.all([
    getCustomers(searchParams),
    getCustomerSources(),
    getCustomerPreferences(),
  ]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <h1 className="admin-title" style={{ margin: 0 }}>Клиенты</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href={exportHref(searchParams)} className="admin-btn">Экспорт клиентов</a>
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
            <label htmlFor="customerType">Тип клиента</label>
            <select id="customerType" name="customerType" defaultValue={searchParams.customerType || ''}>
              <option value="">Все</option>
              <option value="person">Физическое лицо</option>
              <option value="company">Юридическое лицо</option>
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
            <label htmlFor="preferences">Предпочтения</label>
            <select id="preferences" name="preferences" defaultValue={searchParams.preferences || ''}>
              <option value="">Все</option>
              {preferences.map((p) => (
                <option key={p.id} value={p.id}>{p.attributes.title}</option>
              ))}
            </select>
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
            <label htmlFor="amountFrom">Покупки, ₽</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="number" min={0} id="amountFrom" name="amountFrom" placeholder="от"
                defaultValue={searchParams.amountFrom || ''}
              />
              <input type="number" min={0} name="amountTo" placeholder="до" defaultValue={searchParams.amountTo || ''} />
            </div>
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
          <CustomersTable customers={customers} total={total} current={searchParams} />
        </div>
      </div>
    </div>
  );
}
