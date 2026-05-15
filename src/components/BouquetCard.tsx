'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/lib/cart';
import { Bouquet } from '@/types';
import Icon from './Icon';

interface BouquetWithImage extends Bouquet {
  imageUrl?: string | null;
}

const fmtPrice = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' \u20BD';

export default function BouquetCard({ bouquet, index = 0 }: { bouquet: BouquetWithImage; index?: number }) {
  const addItem = useCart((s) => s.addItem);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem({
      id: bouquet.id,
      title: bouquet.attributes.title,
      price: bouquet.attributes.saleAmount,
      quantity: 1,
      imageUrl: bouquet.imageUrl ?? undefined,
    });
  };

  return (
    <article className="ed-card">
      <Link href={`/bouquet/${bouquet.id}`} className="ed-card__media" data-hover>
        {bouquet.imageUrl ? (
          <Image
            src={bouquet.imageUrl}
            alt={bouquet.attributes.title}
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
            В корзину &middot; {fmtPrice(bouquet.attributes.saleAmount)}
          </button>
        </div>
        <span className="ed-card__num">N&deg;{String(index + 1).padStart(2, '0')}</span>
      </Link>
      <div className="ed-card__meta">
        <div className="ed-card__row">
          <h4 className="ed-card__t">{bouquet.attributes.title}</h4>
          <span className="ed-card__price">{fmtPrice(bouquet.attributes.saleAmount)}</span>
        </div>
      </div>
    </article>
  );
}
