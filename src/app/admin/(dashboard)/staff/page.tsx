import Link from 'next/link';
import { getWorkersPage, getRoles, STAFF_PAGE_SIZE, StaffSearchParams } from '@/lib/adminStaff';
import { getStores } from '@/lib/adminOrders';
import StaffNav from '@/components/admin/StaffNav';
import WorkerRowMenu from '@/components/admin/WorkerRowMenu';

export const metadata = { title: 'Сотрудники' };

interface Props {
  searchParams: StaffSearchParams;
}

export default async function AdminStaffPage({ searchParams }: Props) {
  const [{ workers, total }, roles, stores] = await Promise.all([
    getWorkersPage(searchParams),
    getRoles(),
    getStores(),
  ]);

  const rolesById = Object.fromEntries(roles.map((r) => [r.id, r]));
  const storesById = Object.fromEntries(stores.map((s) => [s.id, s]));

  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const pageCount = Math.max(1, Math.ceil(total / STAFF_PAGE_SIZE));

  return (
    <div>
      <StaffNav active="/admin/staff" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <h1 className="admin-title" style={{ margin: 0 }}>Сотрудники</h1>
        <Link href="/admin/staff/create" className="admin-btn admin-btn--primary">Добавить сотрудника</Link>
      </div>

      {workers.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Сотрудники не найдены.</div></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Статус</th>
                <th>Логин</th>
                <th>Роль</th>
                <th>Точки продаж</th>
                <th>Права доступа</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => {
                const a = w.attributes;
                const roleId = w.relationships?.role?.data?.id;
                const role = roleId ? rolesById[roleId] : null;
                const storeIds = a.storeIds || [];
                const rights = a.accessRights || [];
                return (
                  <tr key={w.id}>
                    <td><Link href={`/admin/staff/${w.id}/edit`}>{a.name}</Link></td>
                    <td>
                      <span className={`admin-staff-status admin-staff-status--${a.status}`}>
                        {a.status === 'active' ? 'Активный' : 'Приостановлен'}
                      </span>
                    </td>
                    <td>{a.login || '—'}</td>
                    <td>{role?.attributes.title || '—'}</td>
                    <td>
                      {storeIds.length === 0
                        ? '—'
                        : storeIds.map((id) => storesById[id]?.attributes.title || '—').join(', ')}
                    </td>
                    <td>
                      {rights.length === 0 ? (
                        '—'
                      ) : (
                        <ul className="admin-rights-list">
                          {rights.map((r) => <li key={r}>{r}</li>)}
                        </ul>
                      )}
                    </td>
                    <td><WorkerRowMenu workerId={w.id} status={a.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="admin-pagination">
            <span>Найдено сотрудников: {total}</span>
            <div className="admin-pagination__pages">
              {Array.from({ length: pageCount }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2)
                .map((p, idx, arr) => (
                  <span key={p} style={{ display: 'flex', alignItems: 'center' }}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ padding: '0 2px' }}>…</span>}
                    {p === page ? (
                      <span className="admin-pagination__current">{p}</span>
                    ) : (
                      <Link href={`/admin/staff?page=${p}`}>{p}</Link>
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
