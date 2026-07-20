import DictionaryChipsScreen from '@/components/admin/DictionaryChipsScreen';

export const metadata = { title: 'Источники сделок' };

// «Источники сделок» (admin-map §2.7) — chip-list dictionary (AmoCRM, Сайт,
// Телефон, Терминал…). NB: the page route is /admin/customer-deal-sources but
// the backend dictionary lives at /v1/order-sources — same as Posiflora.
export default function CustomerDealSourcesPage() {
  return (
    <DictionaryChipsScreen
      route="/admin/customer-deal-sources"
      apiType="order-sources"
      title="Источники сделок"
      placeholder="Укажите наименование нового источника"
    />
  );
}
