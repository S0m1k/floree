'use client';

import { useState } from 'react';
import { CartLine, PosProduct, fmtMoney } from './PosTerminal';

interface Props {
  products: PosProduct[] | null;
  cart: CartLine[];
  onAdd: (p: PosProduct) => void;
}

// «Товары» — каталог позиций с фото и ценой; тап добавляет в корзину, на
// плитке появляется счётчик, как в терминале Posiflora.
export default function PosProductsTab({ products, cart, onAdd }: Props) {
  const [query, setQuery] = useState('');

  if (products === null) return <div className="pos__empty">Загрузка каталога…</div>;

  const q = query.trim().toLowerCase();
  const shown = q ? products.filter((p) => p.title.toLowerCase().includes(q)) : products;
  const qtyById = new Map(
    cart.filter((l) => l.kind === 'item').map((l) => [l.id, l.qty]),
  );

  return (
    <div className="pos__tab">
      <h1 className="pos__title">Товары</h1>
      <input
        type="search"
        className="pos__search"
        placeholder="Название, артикул, штрихкод"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {shown.length === 0 ? (
        <div className="pos__empty">Ничего не найдено</div>
      ) : (
        <div className="pos__cards">
          {shown.map((p) => {
            const inCart = qtyById.get(p.id) || 0;
            return (
              <button key={p.id} type="button" className="pos__card pos__card--tappable" onClick={() => onAdd(p)}>
                {p.photo ? (
                  // Каталожные фото живут на CDN Posiflora — обычный <img>,
                  // прогонять их через next/image оптимизатор нет смысла.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photo} alt="" className="pos__card-photo" loading="lazy" />
                ) : (
                  <div className="pos__card-photo pos__card-photo--placeholder">
                    <span className="pos__card-initials">{p.title.slice(0, 2)}</span>
                  </div>
                )}
                {inCart > 0 && <span className="pos__card-qty">🛒 {inCart}</span>}
                <div className="pos__card-title">{p.title}</div>
                <div className="pos__card-footer">
                  <span className="pos__card-price">{fmtMoney(p.price)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
