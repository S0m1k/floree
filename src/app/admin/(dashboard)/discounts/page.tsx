import CustomersNav from '@/components/admin/CustomersNav';
import DiscountGroupsTable from '@/components/admin/DiscountGroupsTable';
import { getDiscountGroups } from '@/lib/adminLoyalty';

export const metadata = { title: 'Скидки' };

// «Скидки» (admin-map §2.5.5) — discount groups.
export default async function AdminDiscountsPage() {
  const groups = await getDiscountGroups();
  return (
    <div>
      <CustomersNav active="/admin/discounts" />
      <h1 className="admin-title">Скидки</h1>
      <DiscountGroupsTable groups={groups} />
    </div>
  );
}
