import BouquetsNav from '@/components/admin/BouquetsNav';
import PosifloraImportPanel from '@/components/admin/PosifloraImportPanel';
import { adminFetch } from '@/lib/adminApi';

export const metadata = { title: 'Импорт из Posiflora' };

async function getSettings() {
  const res = await adminFetch('/api/v1/posiflora-settings');
  if (!res.ok) return null;
  return (await res.json()).data?.attributes ?? null;
}

async function getLastRun() {
  const res = await adminFetch('/api/v1/posiflora-import/status');
  if (!res.ok) return null;
  return (await res.json()).data?.attributes ?? null;
}

// «Импорт из Posiflora» — перенос всех данных клиента в нашу базу по кнопке:
// каталог, клиенты, заказы, склад, справочники + скачивание фото к нам.
export default async function PosifloraImportPage() {
  const [settings, lastRun] = await Promise.all([getSettings(), getLastRun()]);

  return (
    <div>
      <BouquetsNav active="/admin/posiflora-import" />
      <h1 className="admin-title">Импорт из Posiflora</h1>
      <PosifloraImportPanel settings={settings} lastRun={lastRun} />
    </div>
  );
}
