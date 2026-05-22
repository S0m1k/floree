'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/lib/cart';
import { Recipe } from '@/types';
import Icon from './Icon';

const fmtPrice = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' \u20BD';

export default function RecipeCard({ recipe, index = 0 }: { recipe: Recipe; index?: number }) {
  const addItem = useCart((s) => s.addItem);
  const price = recipe.attributes.minPrice;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem({
      id: recipe.id,
      title: recipe.attributes.title,
      price,
      quantity: 1,
      imageUrl: recipe.imageUrl ?? undefined,
    });
  };

  return (
    <article className="ed-card">
      <Link href={`/recipe/${recipe.id}`} className="ed-card__media" data-hover>
        {recipe.imageUrl ? (
          <Image
            src={recipe.imageUrl}
            alt={recipe.attributes.title}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'var(--bone)', color: 'var(--ink-3)' }}>
            <Icon name="flower-tulip" size={64} />
          </div>
        )}
        <div className="ed-card__overlay">
          <button className="btn btn--filled" onClick={handleAddToCart} data-hover>
            В корзину &middot; {fmtPrice(price)}
          </button>
        </div>
        <span className="ed-card__num">N&deg;{String(index + 1).padStart(2, '0')}</span>
      </Link>
      <div className="ed-card__meta">
        <div className="ed-card__row">
          <h4 className="ed-card__t">{recipe.attributes.title}</h4>
          <span className="ed-card__price">{fmtPrice(price)}</span>
        </div>
      </div>
    </article>
  );
}
