import DictionaryChipsScreen from '@/components/admin/DictionaryChipsScreen';

export const metadata = { title: 'Причины скидок и надбавок' };

// «Причины скидок и надбавок» (admin-map §2.7) — chip-list dictionary used
// when applying a manual discount/markup on an order.
export default function DiscountReasonsPage() {
  return (
    <DictionaryChipsScreen
      route="/admin/discount-reasons"
      apiType="discount-reasons"
      title="Причины скидок и надбавок"
      placeholder="Укажите наименование новой причины"
    />
  );
}
