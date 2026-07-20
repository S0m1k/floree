'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SimpleDictEntry } from '@/types';
import PosPaymentModal from './PosPaymentModal';
import PosOrdersTab from './PosOrdersTab';
import PosProductsTab from './PosProductsTab';
import PosCartTab from './PosCartTab';
import PosShowcaseTab from './PosShowcaseTab';
import PosMoreTab from './PosMoreTab';

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat('ru-RU').format(Math.round(n * 100) / 100) + ' ₽';

export interface PosProduct {
  id: string;
  title: string;
  price: number;
  photo?: string | null;
  createdAt?: string | null;
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

type Tab = 'orders' | 'products' | 'cart' | 'showcase' | 'more';

interface Props {
  stores: SimpleDictEntry[];
}

// Мобильный терминал флориста — наш аналог приложения «Терминал» Posiflora:
// нижние вкладки Заказы / Товары / Корзина / Витрина / Ещё, продажа с витрины
// и из каталога, смена и касса — в «Ещё».
export default function PosTerminal({ stores }: Props) {
  const [storeId, setStoreId] = useState(stores[0]?.id || '');
  const [tab, setTab] = useState<Tab>('showcase');
  const [context, setContext] = useState<PosContext | null>(null);
  const [products, setProducts] = useState<{ bouquets: PosProduct[]; items: PosProduct[] } | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    if (!storeId) return;
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
    setError(null);
    loadContext();
    loadProducts();
  }, [storeId, loadContext, loadProducts]);

  const total = useMemo(() => cart.reduce((sum, l) => sum + l.price * l.qty, 0), [cart]);
  const shiftOpen = Boolean(context?.shift);

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
    setNotice(change != null && change > 0 ? `Продажа проведена. Сдача: ${fmtMoney(change)}` : 'Продажа проведена');
    setTab('showcase');
    loadContext();
    loadProducts();
  };

  const cartCount = cart.reduce((n, l) => n + l.qty, 0);

  const TABS: { key: Tab; label: string; icon: string; badge?: string }[] = [
    { key: 'orders', label: 'Заказы', icon: '≣' },
    { key: 'products', label: 'Товары', icon: '✿' },
    { key: 'cart', label: total > 0 ? fmtMoney(total).replace(' ₽', '') : 'Корзина', icon: '🛒' },
    { key: 'showcase', label: 'Витрина', icon: '⌂' },
    { key: 'more', label: 'Ещё', icon: '⋯' },
  ];

  return (
    <div className="pos">
      <div className="pos__screen">
        {error && (
          <div className="pos__error" onClick={() => setError(null)}>{error}</div>
        )}
        {notice && (
          <div className="pos__notice" onClick={() => setNotice(null)}>{notice}</div>
        )}
        {!shiftOpen && context !== null && tab !== 'more' && (
          <div className="pos__shift-warning" onClick={() => setTab('more')}>
            Смена не открыта — продажи недоступны. Открыть смену →
          </div>
        )}

        {tab === 'orders' && <PosOrdersTab storeId={storeId} />}
        {tab === 'products' && (
          <PosProductsTab products={products?.items ?? null} cart={cart} onAdd={addItem} />
        )}
        {tab === 'cart' && (
          <PosCartTab
            cart={cart}
            total={total}
            changeQty={changeQty}
            removeLine={removeLine}
            canPay={shiftOpen && cart.length > 0}
            onPay={() => setPayOpen(true)}
          />
        )}
        {tab === 'showcase' && (
          <PosShowcaseTab products={products?.bouquets ?? null} cart={cart} onAdd={addBouquet} />
        )}
        {tab === 'more' && (
          <PosMoreTab
            stores={stores}
            storeId={storeId}
            onStoreChange={setStoreId}
            context={context}
            onChanged={loadContext}
            onError={setError}
          />
        )}
      </div>

      <nav className="pos__tabbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`pos__tabbar-item ${tab === t.key ? 'pos__tabbar-item--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span className="pos__tabbar-icon">
              {t.icon}
              {t.key === 'cart' && cartCount > 0 && <span className="pos__tabbar-badge">{cartCount}</span>}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {payOpen && (
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
