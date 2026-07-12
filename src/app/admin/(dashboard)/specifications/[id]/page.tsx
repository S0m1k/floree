import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCategories, getSpecification } from '@/lib/adminCatalog';
import { getStores, getWorkers } from '@/lib/adminOrders';
import { getAllInventoryItemsMap } from '@/lib/adminInventory';
import { getDictionary } from '@/lib/adminSettings';
import SpecificationHeaderActions from '@/components/admin/SpecificationHeaderActions';
import SpecificationEditForm from '@/components/admin/SpecificationEditForm';
import SpecificationGallery from '@/components/admin/SpecificationGallery';
import SpecificationVariantsSection from '@/components/admin/SpecificationVariantsSection';

export const metadata = { title: 'Рецепт' };

interface Props {
  params: { id: string };
}

export default async function AdminSpecificationDetailPage({ params }: Props) {
  const detail = await getSpecification(params.id);
  if (!detail) notFound();

  const [categories, workers, tags, stores, inventoryById] = await Promise.all([
    getCategories(),
    getWorkers(),
    getDictionary('recipe-tags'),
    getStores(),
    getAllInventoryItemsMap(),
  ]);

  const { spec, variants, variantLabels, prices, compositions, images } = detail;
  const a = spec.attributes;

  const galleryImages = (spec.relationships.images?.data || []).map((d) => ({
    id: d.id,
    url: images[d.id]?.attributes.fileShop || images[d.id]?.attributes.file || null,
  }));
  const mainImageId = spec.relationships.logo?.data?.id || null;

  const selectedTagIds = (spec.relationships.recipeTags?.data || []).map((d) => d.id);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <Link href="/admin/specifications" className="admin-btn" style={{ flex: '0 0 auto' }}>← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>{a.title}</h1>
        <SpecificationHeaderActions specId={spec.id} isPublic={a.public} isArchived={a.status === 'off'} />
      </div>

      <div className="admin-recipe-card-columns">
        <SpecificationEditForm
          spec={spec}
          categories={categories}
          workers={workers}
          tags={tags}
          selectedTagIds={selectedTagIds}
        />
        <SpecificationGallery specId={spec.id} images={galleryImages} mainImageId={mainImageId} />
      </div>

      <SpecificationVariantsSection
        specId={spec.id}
        specTitle={a.title}
        variants={variants}
        variantLabels={variantLabels}
        prices={prices}
        compositions={compositions}
        itemsById={inventoryById}
        allItems={Object.values(inventoryById)}
        stores={stores}
      />
    </div>
  );
}
