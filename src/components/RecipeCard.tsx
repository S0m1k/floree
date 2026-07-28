import Link from 'next/link';
import Image from 'next/image';
import { Recipe } from '@/types';
import Icon from './Icon';

const fmtPrice = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';

// The whole card links to the recipe page: the client picks the size (variant)
// there before anything is added to the cart.
export default function RecipeCard({ recipe }: { recipe: Recipe; index?: number }) {
  const price = recipe.attributes.minPrice;

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
          <span className="btn btn--filled">
            Выбрать размер
          </span>
        </div>
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
