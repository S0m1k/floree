import SettingsNav from '@/components/admin/SettingsNav';
import CelebrationsTable from '@/components/admin/CelebrationsTable';
import { getDictionary } from '@/lib/adminSettings';

export const metadata = { title: 'Праздничные события' };

// «Праздничные события» (admin-map §2.7) — table dictionary with a period:
// «Создать» (inline form) + `Название | Период | ⋮ (Удалить)`.
export default async function CustomerCelebrationsPage() {
  const entries = await getDictionary('customer-celebrations');
  return (
    <div>
      <SettingsNav active="/admin/customer-celebrations" />
      <h1 className="admin-title">Праздничные события</h1>
      <CelebrationsTable entries={entries} />
    </div>
  );
}
