import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRoles, getWorkerById, ACCESS_RIGHT_SETS } from '@/lib/adminStaff';
import { getStores } from '@/lib/adminOrders';
import WorkerForm from '@/components/admin/WorkerForm';

export const metadata = { title: 'Редактирование сотрудника' };

interface Props {
  params: { id: string };
}

export default async function EditWorkerPage({ params }: Props) {
  const [worker, stores, roles] = await Promise.all([
    getWorkerById(params.id),
    getStores(),
    getRoles(),
  ]);
  if (!worker) notFound();

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Link href="/admin/staff" className="admin-btn" style={{ flex: '0 0 auto' }}>← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>{worker.attributes.name}</h1>
      </div>

      <WorkerForm stores={stores} roles={roles} accessRightSets={ACCESS_RIGHT_SETS} worker={worker} />
    </div>
  );
}
