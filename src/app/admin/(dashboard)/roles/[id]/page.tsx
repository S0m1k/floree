import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRoleById } from '@/lib/adminStaff';
import RolePermissionsForm from '@/components/admin/RolePermissionsForm';

export const metadata = { title: 'Настройки роли' };

interface Props {
  params: { id: string };
}

export default async function AdminRoleDetailPage({ params }: Props) {
  const role = await getRoleById(params.id);
  if (!role) notFound();

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Link href="/admin/roles" className="admin-btn" style={{ flex: '0 0 auto' }}>← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>{role.attributes.title}</h1>
      </div>

      <nav className="admin-tabs">
        <span className="admin-tab admin-tab--active">Приложения POS и Florist</span>
      </nav>

      <p className="admin-form-note" style={{ marginBottom: 16 }}>
        Здесь вы можете настроить доступы и ограничения для приложения на планшете
      </p>

      <RolePermissionsForm role={role} />
    </div>
  );
}
