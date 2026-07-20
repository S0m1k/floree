'use client';

import { CartLine, PosProduct, fmtMoney } from './PosTerminal';
import { useState } from 'react';

// Бейдж срока жизни букета, как в терминале Posiflora: «6 часов» / «2 дня».
// Срок — 3 суток с момента сборки (см. showcaseFormat.SHELF_LIFE_DAYS).
const SHELF_LIFE_MS = 3 * 24 * 60 * 60 * 1000;

function shelfLifeBadge(createdAt: string | null | undefined): { text: string; expired: boolean } {
  if (!createdAt) return { text: '', expired: false };
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return { text: '', expired: false };
  const leftMs = created.getTime() + SHELF_LIFE_MS - Date.now();
  if (leftMs <= 0) return { text: 'просрочен', expired: true };
  const hours = Math.ceil(leftMs / (60 * 60 * 1000));
  if (hours < 24) {
    return { text: `${hours} ч`, expired: false };
  }
  const days = Math.ceil(hours / 24);
  return { text: `${days} дн`, expired: false };
}

interface Props {
  products: PosProduct[] | null;
  cart: CartLine[];
  onAdd: (p: PosProduct) => void;
}

// «Витрина» — собранные букеты точки: карточка с бейджем срока жизни, ценой
// и кнопкой в корзину (букет штучный — добавляется один раз).
export default function PosShowcaseTab({ products, cart, onAdd }: Props) {
  const [query, setQuery] = useState('');

  if (products === null) return <div className="pos__empty">Загрузка витрины…</div>;

  const q = query.trim().toLowerCase();
  const shown = q ? products.filter((p) => p.title.toLowerCase().includes(q)) : products;
  const inCart = new Set(cart.filter((l) => l.kind === 'bouquet').map((l) => l.id));

  return (
    <div className="pos__tab">
      <h1 className="pos__title">Витрина</h1>
      <input
        type="search"
        className="pos__search"
        placeholder="Поиск по названию или номеру"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {shown.length === 0 ? (
        <div className="pos__empty">Букетов на витрине нет</div>
      ) : (
        <div className="pos__cards">
          {shown.map((p) => {
            const badge = shelfLifeBadge(p.createdAt);
            const added = inCart.has(p.id);
            return (
              <div key={p.id} className="pos__card">
                <div className="pos__card-photo pos__card-photo--placeholder">
                  {badge.text && (
                    <span className={`pos__card-badge ${badge.expired ? 'pos__card-badge--expired' : ''}`}>
                      {badge.text}
                    </span>
                  )}
                  <span className="pos__card-initials">{p.title.slice(0, 2)}</span>
                </div>
                <div className="pos__card-title">{p.title}</div>
                <div className="pos__card-footer">
                  <span className="pos__card-price">{fmtMoney(p.price)}</span>
                  <button
                    type="button"
                    className={`pos__card-add ${added ? 'pos__card-add--added' : ''}`}
                    onClick={() => onAdd(p)}
                    disabled={added}
                    aria-label={added ? 'В корзине' : 'В корзину'}
                  >
                    {added ? '✓' : '🛒'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
