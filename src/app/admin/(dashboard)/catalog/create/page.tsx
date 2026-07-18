import Link from 'next/link';
import { getCategories } from '@/lib/adminCatalog';
import { getMeasures } from '@/lib/adminInventory';
import ItemForm from '@/components/admin/ItemForm';

export const metadata = { title: 'Создать продукт' };

export default async function AdminCatalogCreatePage() {
  const [categories, measures] = await Promise.all([
    getCategories(),
    getMeasures(),
  ]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Link href="/admin/catalog" className="admin-btn">← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>Создать продукт</h1>
      </div>
      <ItemForm categories={categories} measures={measures} />
    </div>
  );
}
