import Link from 'next/link';
import { getRoles, ACCESS_RIGHT_SETS } from '@/lib/adminStaff';
import { getStores } from '@/lib/adminOrders';
import WorkerForm from '@/components/admin/WorkerForm';

export const metadata = { title: 'Новый сотрудник' };

export default async function CreateWorkerPage() {
  const [stores, roles] = await Promise.all([getStores(), getRoles()]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Link href="/admin/staff" className="admin-btn" style={{ flex: '0 0 auto' }}>← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>Новый сотрудник</h1>
      </div>

      <WorkerForm stores={stores} roles={roles} accessRightSets={ACCESS_RIGHT_SETS} />
    </div>
  );
}
