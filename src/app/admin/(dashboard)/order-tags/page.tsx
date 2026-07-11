import DictionaryChipsScreen from '@/components/admin/DictionaryChipsScreen';

export const metadata = { title: 'Теги заказов' };

// «Теги заказов» (admin-map §2.7) — chip-list dictionary, used as the
// «Быстрые теги» chips on the order form.
export default function OrderTagsPage() {
  return (
    <DictionaryChipsScreen
      route="/admin/order-tags"
      apiType="order-tags"
      title="Теги заказов"
      placeholder="Укажите наименование нового тега"
    />
  );
}
