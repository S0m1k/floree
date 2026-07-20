import DictionaryChipsScreen from '@/components/admin/DictionaryChipsScreen';

export const metadata = { title: 'Теги букетов' };

// «Теги букетов» (admin-map §2.7) — chip-list dictionary for recipes/bouquets.
export default function RecipeTagsPage() {
  return (
    <DictionaryChipsScreen
      route="/admin/recipe-tags"
      apiType="recipe-tags"
      title="Теги букетов"
      placeholder="Укажите наименование нового тега"
    />
  );
}
