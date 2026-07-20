import SettingsNav from '@/components/admin/SettingsNav';
import PersonalDataForm from '@/components/admin/PersonalDataForm';
import { getPersonalData } from '@/lib/adminSettings';

export const metadata = { title: 'Форма заполнения политики' };

// «Форма заполнения политики» (admin-map §2.7) — editable template of the
// personal-data processing consent (ИП/ООО, ИНН, юр. адрес, сайт, email).
export default async function PersonalDataPage() {
  const initial = await getPersonalData();
  return (
    <div>
      <SettingsNav active="/admin/personal-data" />
      <h1 className="admin-title">Форма заполнения политики</h1>
      <PersonalDataForm initial={initial} />
    </div>
  );
}
