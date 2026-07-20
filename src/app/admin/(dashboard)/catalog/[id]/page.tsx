import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCategories } from '@/lib/adminCatalog';
import { getInventoryItem, getMeasures } from '@/lib/adminInventory';
import ItemForm from '@/components/admin/ItemForm';
import ItemHeaderActions from '@/components/admin/ItemHeaderActions';

export const metadata = { title: 'Товар' };

interface Props {
  params: { id: string };
}

export default async function AdminCatalogItemPage({ params }: Props) {
  const item = await getInventoryItem(params.id);
  if (!item) notFound();

  const [categories, measures] = await Promise.all([
    getCategories(),
    getMeasures(),
  ]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <Link href="/admin/catalog" className="admin-btn" style={{ flex: '0 0 auto' }}>← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>{item.attributes.title}</h1>
        <ItemHeaderActions item={item} />
      </div>
      <ItemForm item={item} categories={categories} measures={measures} />
    </div>
  );
}
