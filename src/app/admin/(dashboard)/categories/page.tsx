import Link from 'next/link';
import { getCategories } from '@/lib/adminCatalog';
import BouquetsNav from '@/components/admin/BouquetsNav';
import { AdminCategory } from '@/types';

export const metadata = { title: 'Категории' };

function buildTree(categories: AdminCategory[]): Map<string | null, AdminCategory[]> {
  const byParent = new Map<string | null, AdminCategory[]>();
  for (const c of categories) {
    const parentId = c.relationships.parent.data?.id ?? null;
    const siblings = byParent.get(parentId) || [];
    siblings.push(c);
    byParent.set(parentId, siblings);
  }
  return byParent;
}

function CategoryRow({ category, depth, byParent }: { category: AdminCategory; depth: number; byParent: Map<string | null, AdminCategory[]> }) {
  const children = byParent.get(category.id) || [];
  return (
    <>
      <div className="admin-category-row" style={{ paddingLeft: 16 + depth * 24 }}>
        <span className="material-symbols-outlined admin-category-row__icon">folder</span>
        <span>{category.attributes.title}</span>
      </div>
      {children.map((child) => (
        <CategoryRow key={child.id} category={child} depth={depth + 1} byParent={byParent} />
      ))}
    </>
  );
}

export default async function AdminCategoriesPage() {
  const categories = await getCategories();
  const visible = categories.filter((c) => !c.attributes.deleted);
  const byParent = buildTree(visible);
  const roots = byParent.get(null) || [];

  return (
    <div>
      <BouquetsNav active="/admin/categories" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="admin-title">Категории</h1>
        <Link href="/admin/specifications" className="admin-btn" style={{ height: 36, marginBottom: 16 }}>← Рецепты</Link>
      </div>

      <div className="admin-table-wrap">
        {roots.length === 0 ? (
          <div className="admin-empty">Категории не найдены.</div>
        ) : (
          roots.map((root) => (
            <CategoryRow key={root.id} category={root} depth={0} byParent={byParent} />
          ))
        )}
      </div>
    </div>
  );
}
