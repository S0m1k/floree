import SettingsNav from '@/components/admin/SettingsNav';
import MeasuresTable from '@/components/admin/MeasuresTable';
import { getDictionary } from '@/lib/adminSettings';

export const metadata = { title: 'Единицы измерения' };

// «Единицы измерения» (admin-map §2.7) — table dictionary: «Создать» +
// `Название | Сокращение | Мера количества товара | ⋮ (Редактировать, Удалить)`.
// Page route is /admin/units-of-measure; the backend dictionary is /v1/measures.
export default async function UnitsOfMeasurePage() {
  const entries = await getDictionary('measures');
  return (
    <div>
      <SettingsNav active="/admin/units-of-measure" />
      <h1 className="admin-title">Единицы измерения</h1>
      <MeasuresTable entries={entries} />
    </div>
  );
}
