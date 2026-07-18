import Link from 'next/link';
import { getCategories } from '@/lib/adminCatalog';
import { getDictionary } from '@/lib/adminSettings';
import SpecificationCreateForm from '@/components/admin/SpecificationCreateForm';

export const metadata = { title: 'Новый рецепт' };

export default async function AdminSpecificationCreatePage() {
  const [categories, tags] = await Promise.all([
    getCategories(),
    getDictionary('recipe-tags'),
  ]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Link href="/admin/specifications" className="admin-btn">← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>Новый рецепт</h1>
      </div>
      <SpecificationCreateForm categories={categories} tags={tags} />
    </div>
  );
}
