'use client';

import { useState } from 'react';
import AddToCartButton from './AddToCartButton';
import { CartItem, RecipeVariant } from '@/types';

interface Props {
  recipeId: string;
  title: string;
  imageUrl?: string;
  fallbackPrice: number;
  variants: RecipeVariant[];
}

const formatPrice = (price: number) => new Intl.NumberFormat('ru-RU').format(Math.round(price));

export default function RecipePurchase({ recipeId, title, imageUrl, fallbackPrice, variants }: Props) {
  const priced = variants.filter((v) => v.price != null);
  const showSwitcher = priced.length > 1;

  const defaultIndex = Math.max(0, priced.findIndex((v) => v.isDefault));
  const [selected, setSelected] = useState(priced[defaultIndex] ?? null);

  const price = selected?.price ?? fallbackPrice;

  const cartItem: CartItem = {
    id: selected ? `${recipeId}:${selected.swvId}` : recipeId,
    recipeId,
    swvId: selected?.swvId,
    title: showSwitcher && selected?.title ? `${title} — ${selected.title}` : title,
    price,
    quantity: 1,
    imageUrl,
  };

  return (
    <div>
      {showSwitcher && (
        <div className="mb-6">
          <p className="eyebrow mb-3" style={{ color: 'var(--ink-3)' }}>Количество</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {priced.map((v) => {
              const active = selected?.swvId === v.swvId;
              return (
                <button
                  key={v.swvId}
                  type="button"
                  onClick={() => setSelected(v)}
                  aria-pressed={active}
                  style={{
                    padding: '10px 18px',
                    border: `1px solid ${active ? 'var(--plum)' : 'var(--line)'}`,
                    background: active ? 'var(--plum)' : 'transparent',
                    color: active ? 'var(--paper)' : 'var(--ink)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontSize: '0.95rem',
                  }}
                >
                  {v.title ?? `${v.qty ?? ''}`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-8" style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span className="serif" style={{ fontSize: '2rem', color: 'var(--plum)' }}>
          {formatPrice(price)} ₽
        </span>
      </div>

      <AddToCartButton item={cartItem} />
    </div>
  );
}
