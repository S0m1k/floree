import DictionaryChipsScreen from '@/components/admin/DictionaryChipsScreen';

export const metadata = { title: 'Предпочтения клиентов' };

// «Предпочтения клиентов» (admin-map §2.7) — chip-list dictionary shown as a
// filter/field on the customer card.
export default function CustomerPreferencesPage() {
  return (
    <DictionaryChipsScreen
      route="/admin/customer-preferences"
      apiType="customer-preferences"
      title="Предпочтения клиентов"
      placeholder="Укажите наименование нового предпочтения"
    />
  );
}
