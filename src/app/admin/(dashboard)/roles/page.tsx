import Link from 'next/link';
import { getRoles } from '@/lib/adminStaff';
import { RolePermissions } from '@/types';
import StaffNav from '@/components/admin/StaffNav';

export const metadata = { title: 'Настройки доступов' };

// «Доступ к функционалу» column: Posiflora shows «Скидки и надбавки» when the
// role has any discount/markup permission enabled, otherwise «—».
function functionalAccess(permissions: RolePermissions | null): string {
  if (permissions && Object.values(permissions).some(Boolean)) {
    return 'Скидки и надбавки';
  }
  return '—';
}

export default async function AdminRolesPage() {
  const roles = await getRoles();

  return (
    <div>
      <StaffNav active="/admin/roles" />

      <h1 className="admin-title">Настройки доступов</h1>

      {roles.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Роли не найдены.</div></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Список ролей</th>
                <th>Доступ к функционалу</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <td><Link href={`/admin/roles/${role.id}`}>{role.attributes.title}</Link></td>
                  <td>{functionalAccess(role.attributes.permissions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
