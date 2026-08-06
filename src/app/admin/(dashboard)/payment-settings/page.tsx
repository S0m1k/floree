import BouquetsNav from '@/components/admin/BouquetsNav';
import PaymentPromoForm from '@/components/admin/PaymentPromoForm';
import { getPaymentSettings, getPromoCodes } from '@/lib/adminPayments';

export const metadata = { title: 'Оплата и промокоды' };

// «Оплата и промокоды»: ключи эквайринга Т-Банк + справочник промокодов
// витрины. Оба хранятся в БД и имеют приоритет над .env.
export default async function PaymentSettingsPage() {
  const [settings, promoCodes] = await Promise.all([
    getPaymentSettings(),
    getPromoCodes(),
  ]);

  return (
    <div>
      <BouquetsNav active="/admin/payment-settings" />
      <h1 className="admin-title">Оплата и промокоды</h1>
      <PaymentPromoForm settings={settings} promoCodes={promoCodes} />
    </div>
  );
}
