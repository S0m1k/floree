import { getDevices } from '@/lib/adminStaff';
import { getWorkers } from '@/lib/adminOrders';
import StaffNav from '@/components/admin/StaffNav';

export const metadata = { title: 'Устройства флористов' };

const fmtDateTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default async function AdminStaffDevicesPage() {
  const [devices, workers] = await Promise.all([getDevices(), getWorkers()]);
  const workersById = Object.fromEntries(workers.map((w) => [w.id, w]));

  return (
    <div>
      <StaffNav active="/admin/staff-devices" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <h1 className="admin-title" style={{ margin: 0 }}>Устройства флористов</h1>
        <button className="admin-btn admin-btn--primary" disabled title="Пока недоступно">
          Подключить
        </button>
      </div>

      {devices.length === 0 ? (
        <div className="admin-table-wrap">
          <div className="admin-empty">
            Нет подключённых устройств. Приложение «Флорист» позволяет создавать заказы,
            фотографировать букеты на витрину и принимать оплату с телефона.
          </div>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Дата создания</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const workerId = d.relationships?.worker?.data?.id;
                const worker = workerId ? workersById[workerId] : null;
                return (
                  <tr key={d.id}>
                    <td>{worker?.attributes.name || d.attributes.name || '—'}</td>
                    <td>{fmtDateTime(d.attributes.createdAt)}</td>
                    <td>
                      <button className="admin-btn" disabled style={{ height: 28, padding: '0 8px' }}>⋮</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
