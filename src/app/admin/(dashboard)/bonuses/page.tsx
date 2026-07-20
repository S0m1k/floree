import CustomersNav from '@/components/admin/CustomersNav';
import BonusGroupsTable from '@/components/admin/BonusGroupsTable';
import { getBonusGroups } from '@/lib/adminLoyalty';

export const metadata = { title: 'Бонусы' };

// «Бонусы» (admin-map §2.5.4) — bonus groups (tiers of the loyalty system).
export default async function AdminBonusesPage() {
  const groups = await getBonusGroups();
  return (
    <div>
      <CustomersNav active="/admin/bonuses" />
      <h1 className="admin-title">Бонусы</h1>
      <BonusGroupsTable groups={groups} />
    </div>
  );
}
