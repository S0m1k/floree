'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SimpleDictEntry } from '@/types';
import PosShiftPanel from './PosShiftPanel';
import PosPaymentModal from './PosPaymentModal';

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n * 100) / 100) + ' ₽';

export interface PosProduct {
  id: string;
  title: string;
  price: number;
}

export interface PosShift {
  id: string;
  openedAt: string | null;
  openingCash: number | null;
}

export interface PosContext {
  shift: PosShift | null;
  expectedCash: number;
  expectedOpeningCash: number;
  salesCount: number;
  salesTotal: number;
}

export interface CartLine {
  kind: 'bouquet' | 'item';
  id: string;
  title: string;
  price: number;
  qty: number;
}

interface Props {
  stores: SimpleDictEntry[];
}

// Экран кассы (наш аналог приложения «Терминал» Posiflora): смена → продажа
// (букеты с витрины + товары каталога) → оплата нал/карта → следующий клиент.
export default function PosTerminal({ stores }: Props) {
  const [storeId, setStoreId] = useState(stores[0]?.id || '');
  const [context, setContext] = useState<PosContext | null>(null);
  const [products, setProducts] = useState<{ bouquets: PosProduct[]; items: PosProduct[] } | null>(null);
  const [tab, setTab] = useState<'bouquets' | 'items'>('bouquets');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    if (!storeId) return;
    setError(null);
    try {
      const res = await fetch(`/admin/api/pos/context?store=${encodeURIComponent(storeId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Не удалось загрузить состояние кассы');
      const shift = json.data
        ? {
            id: json.data.id as string,
            openedAt: (json.data.attributes.openedAt as string | null) ?? null,
            openingCash: (json.data.attributes.openingCash as number | null) ?? null,
          }
        : null;
      setContext({
        shift,
        expectedCash: Number(json.meta?.expectedCash) || 0,
        expectedOpeningCash: Number(json.meta?.expectedOpeningCash) || 0,
        salesCount: Number(json.meta?.salesCount) || 0,
        salesTotal: Number(json.meta?.salesTotal) || 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  }, [storeId]);

  const loadProducts = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/admin/api/pos/products?store=${encodeURIComponent(storeId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Не удалось загрузить каталог');
      setProducts(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки каталога');
    }
  }, [storeId]);

  useEffect(() => {
    setCart([]);
    setContext(null);
    setProducts(null);
    loadContext();
    loadProducts();
  }, [storeId, loadContext, loadProducts]);

  const total = useMemo(() => cart.reduce((sum, l) => sum + l.price * l.qty, 0), [cart]);

  const addBouquet = (p: PosProduct) => {
    setCart((prev) =>
      prev.some((l) => l.kind === 'bouquet' && l.id === p.id)
        ? prev
        : [...prev, { kind: 'bouquet', id: p.id, title: p.title, price: p.price, qty: 1 }],
    );
  };

  const addItem = (p: PosProduct) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.kind === 'item' && l.id === p.id);
      if (!existing) return [...prev, { kind: 'item', id: p.id, title: p.title, price: p.price, qty: 1 }];
      return prev.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
    });
  };

  const changeQty = (line: CartLine, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l === line ? { ...l, qty: l.kind === 'item' ? Math.max(0, l.qty + delta) : l.qty } : l))
        .filter((l) => l.qty > 0),
    );
  };

  const removeLine = (line: CartLine) => setCart((prev) => prev.filter((l) => l !== line));

  const onSold = (change: number | null) => {
    setPayOpen(false);
    setCart([]);
    setNotice(change != null ? `Продажа проведена. Сдача: ${fmt(change)}` : 'Продажа проведена');
    loadContext();
    loadProducts();
  };

  const shown = useMemo(() => {
    const list = tab === 'bouquets' ? products?.bouquets : products?.items;
    if (!list) return [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((p) => p.title.toLowerCase().includes(q)) : list;
  }, [products, tab, query]);

  const shift = context?.shift ?? null;

  return (
    <div className="pos">
      <header className="pos__header">
        <div className="pos__brand">
          Floree · Касса
          {stores.length > 1 ? (
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.attributes.title}</option>
              ))}
            </select>
          ) : (
            <span className="pos__store">{stores[0]?.attributes.title}</span>
          )}
        </div>
        <Link href="/admin/orders" className="admin-btn">В админку</Link>
      </header>

      {error && <div className="pos__error">{error}</div>}
      {notice && (
        <div className="pos__notice" onClick={() => setNotice(null)}>{notice}</div>
      )}

      {context === null ? (
        <div className="pos__empty">Загрузка…</div>
      ) : (
        <>
          <PosShiftPanel
            storeId={storeId}
            context={context}
            onChanged={() => { loadContext(); }}
            onError={setError}
          />

          {shift && (
            <div className="pos__body">
              <section className="pos__catalog">
                <div className="pos__tabs">
                  <button
                    type="button"
                    className={`admin-chip ${tab === 'bouquets' ? 'admin-chip--active' : ''}`}
                    onClick={() => setTab('bouquets')}
                  >
                    Букеты на витрине
                  </button>
                  <button
                    type="button"
                    className={`admin-chip ${tab === 'items' ? 'admin-chip--active' : ''}`}
                    onClick={() => setTab('items')}
                  >
                    Товары
                  </button>
                  <input
                    type="text"
                    placeholder="Поиск…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pos__search"
                  />
                </div>

                {products === null ? (
                  <div className="pos__empty">Загрузка каталога…</div>
                ) : shown.length === 0 ? (
                  <div className="pos__empty">Ничего не найдено</div>
                ) : (
                  <div className="pos__grid">
                    {shown.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="pos__product"
                        onClick={() => (tab === 'bouquets' ? addBouquet(p) : addItem(p))}
                      >
                        <span className="pos__product-title">{p.title}</span>
                        <span className="pos__product-price">{fmt(p.price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <aside className="pos__cart">
                <h2>Чек</h2>
                {cart.length === 0 ? (
                  <div className="pos__empty">Выберите букет или товар</div>
                ) : (
                  <ul className="pos__cart-list">
                    {cart.map((l, idx) => (
                      <li key={`${l.kind}-${l.id}-${idx}`} className="pos__cart-line">
                        <span className="pos__cart-title">{l.title}</span>
                        <span className="pos__cart-controls">
                          {l.kind === 'item' && (
                            <>
                              <button type="button" className="admin-btn" onClick={() => changeQty(l, -1)}>−</button>
                              <span className="pos__cart-qty">{l.qty}</span>
                              <button type="button" className="admin-btn" onClick={() => changeQty(l, 1)}>+</button>
                            </>
                          )}
                          <span className="pos__cart-sum">{fmt(l.price * l.qty)}</span>
                          <button type="button" className="admin-btn" onClick={() => removeLine(l)} aria-label="Убрать">✕</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="pos__total">
                  <span>Итого</span>
                  <strong>{fmt(total)}</strong>
                </div>
                <button
                  type="button"
                  className="admin-btn admin-btn--primary pos__pay"
                  disabled={cart.length === 0}
                  onClick={() => setPayOpen(true)}
                >
                  Оплата
                </button>
              </aside>
            </div>
          )}
        </>
      )}

      {payOpen && shift && (
        <PosPaymentModal
          storeId={storeId}
          cart={cart}
          total={total}
          onClose={() => setPayOpen(false)}
          onSold={onSold}
        />
      )}
    </div>
  );
}
