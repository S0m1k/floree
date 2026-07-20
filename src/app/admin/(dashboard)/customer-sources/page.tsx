import DictionaryChipsScreen from '@/components/admin/DictionaryChipsScreen';

export const metadata = { title: 'Откуда узнали о нас' };

// «Откуда узнали о нас» (admin-map §2.7) — chip-list dictionary of customer
// acquisition sources.
export default function CustomerSourcesPage() {
  return (
    <DictionaryChipsScreen
      route="/admin/customer-sources"
      apiType="customer-sources"
      title="Откуда узнали о нас"
      placeholder="Укажите наименование нового источника"
    />
  );
}
