import DictionaryChipsScreen from '@/components/admin/DictionaryChipsScreen';

export const metadata = { title: 'Причины изъятий и внесений' };

// «Причины изъятий и внесений» (admin-map §2.7) — chip-list dictionary of
// cash-drawer movement reasons.
export default function CashReasonsPage() {
  return (
    <DictionaryChipsScreen
      route="/admin/cash-reasons"
      apiType="cash-reasons"
      title="Причины изъятий и внесений"
      placeholder="Укажите наименование новой причины"
    />
  );
}
