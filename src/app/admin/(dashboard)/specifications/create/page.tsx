import Link from 'next/link';
import { getCategories } from '@/lib/adminCatalog';
import SpecificationCreateForm from '@/components/admin/SpecificationCreateForm';

export const metadata = { title: 'Новый рецепт' };

export default async function AdminSpecificationCreatePage() {
  const categories = await getCategories();

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Link href="/admin/specifications" className="admin-btn">← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>Новый рецепт</h1>
      </div>
      <SpecificationCreateForm categories={categories} />
    </div>
  );
}
