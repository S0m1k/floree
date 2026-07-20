import { getStores } from '@/lib/adminOrders';
import PosTerminal from '@/components/admin/pos/PosTerminal';

export const metadata = { title: 'Касса' };

// Экран кассы (POS-терминал). Живёт вне группы (dashboard), чтобы не тянуть
// сайдбар админки — касса занимает весь экран. Защита сессией — общий
// middleware /admin/:path*.
export default async function PosPage() {
  const stores = await getStores();
  return <PosTerminal stores={stores} />;
}
