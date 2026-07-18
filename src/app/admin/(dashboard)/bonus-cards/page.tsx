import CustomersNav from '@/components/admin/CustomersNav';
import BonusCardsTable from '@/components/admin/BonusCardsTable';
import { getBonusCards } from '@/lib/adminLoyalty';

export const metadata = { title: 'Бонусные карты' };

// «Бонусные карты» (admin-map §2.5.6) — Wallet (Apple/Google) card templates.
export default async function AdminBonusCardsPage() {
  const cards = await getBonusCards();
  return (
    <div>
      <CustomersNav active="/admin/bonus-cards" />
      <h1 className="admin-title">Бонусные карты</h1>
      <BonusCardsTable cards={cards} />
    </div>
  );
}
