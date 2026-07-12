'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AdminInventoryItem, AdminSpecificationComposition, AdminSpecificationVariant,
  AdminSpecificationVariantLabel, AdminSpecificationVariantPrice, SimpleDictEntry,
} from '@/types';
import SpecificationVariantCard from './SpecificationVariantCard';

interface Props {
  specId: string;
  specTitle: string;
  variants: AdminSpecificationVariant[];
  variantLabels: Record<string, AdminSpecificationVariantLabel>;
  prices: Record<string, AdminSpecificationVariantPrice>;
  compositions: Record<string, AdminSpecificationComposition>;
  itemsById: Record<string, AdminInventoryItem>;
  allItems: AdminInventoryItem[];
  stores: SimpleDictEntry[];
}

// Below-the-fold blocks of the recipe card (admin-map §2.3.2): one
// «Вариант» section per specification-with-variants row, plus the control
// that adds a brand-new one.
export default function SpecificationVariantsSection({
  specId, specTitle, variants, variantLabels, prices, compositions, itemsById, allItems, stores,
}: Props) {
  const router = useRouter();
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addVariant = async () => {
    const title = newTitle.trim();
    if (!title) { setError('Укажите название варианта'); return; }
    setBusy(true);
    setError(null);
    const res = await fetch(`/admin/api/specifications/${specId}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.detail === 'string' ? json.detail : 'Не удалось добавить вариант');
      setBusy(false);
      return;
    }
    setNewTitle('');
    setBusy(false);
    router.refresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20 }}>
      {variants.map((variant) => {
        const variantLabelId = variant.relationships.variant?.data?.id;
        const variantTitle = (variantLabelId && variantLabels[variantLabelId]?.attributes.title) || 'Вариант';

        const compRows = (variant.relationships.composition?.data || [])
          .map((d) => compositions[d.id])
          .filter(Boolean)
          .sort((a, b) => a.attributes.position - b.attributes.position)
          .map((c) => {
            const item = itemsById[c.relationships.item?.data?.id || ''];
            return {
              itemId: c.relationships.item?.data?.id || '',
              title: item?.attributes.title || 'Товар',
              quantity: c.attributes.quantity,
              retailPrice: c.attributes.retailPrice,
            };
          });

        const storePriceRows = (variant.relationships.specVariantPrices?.data || [])
          .map((d) => prices[d.id])
          .filter((p): p is AdminSpecificationVariantPrice => Boolean(p) && Boolean(p.relationships.store.data))
          .map((p) => {
            const storeId = p.relationships.store.data!.id;
            const store = stores.find((s) => s.id === storeId);
            return {
              storeId,
              storeTitle: store?.attributes.title || 'Точка',
              priceValue: p.attributes.priceValue,
              effectivePrice: p.attributes.effectivePrice,
              isDefaultPrice: p.attributes.isDefaultPrice,
            };
          });

        return (
          <SpecificationVariantCard
            key={variant.id}
            specId={specId}
            specTitle={specTitle}
            variant={variant}
            variantTitle={variantTitle}
            compositionRows={compRows}
            compositionTotal={variant.attributes.compositionTotal}
            storePrices={storePriceRows}
            allStores={stores}
            items={allItems}
            canDelete={variants.length > 1}
          />
        );
      })}

      <section className="admin-panel">
        <p className="admin-panel__title">Новый вариант</p>
        <div className="admin-form-actions" style={{ padding: '4px 16px 16px', justifyContent: 'flex-start' }}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Например, «25 штук»"
            style={{ maxWidth: 220 }}
          />
          <button type="button" className="admin-btn admin-btn--primary" onClick={addVariant} disabled={busy}>
            + Добавить вариант
          </button>
        </div>
        {error && <div className="admin-form-error" style={{ margin: '0 16px 16px' }}>{error}</div>}
      </section>
    </div>
  );
}
