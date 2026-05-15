'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import Icon from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
}

const fmtPrice = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' \u20BD';

export default function CartDrawer({ open, onClose }: Props) {
  const items = useCart((s) => s.items);
  const removeItem = useCart((s) => s.removeItem);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const totalPrice = useCart((s) => s.totalPrice);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <div className={`fl-cart-scrim ${open ? 'is-open' : ''}`} onClick={onClose} />
      <aside className={`fl-cart ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <header className="fl-cart__head">
          <div>
            <div className="eyebrow">Корзина</div>
            <div className="serif" style={{ fontSize: 28, fontStyle: 'italic', marginTop: 4 }}>
              {items.length} {items.length === 1 ? 'букет' : items.length < 5 ? 'букета' : 'букетов'}
            </div>
          </div>
          <button className="fl-cart__close" onClick={onClose} data-hover>&times;</button>
        </header>

        <div className="fl-cart__list">
          {items.length === 0 && (
            <div className="fl-cart__empty">
              <p className="serif" style={{ fontStyle: 'italic', fontSize: 22 }}>Пока пусто.</p>
              <p style={{ color: 'var(--ink-2)', marginTop: 8 }}>Загляните в каталог.</p>
            </div>
          )}
          {items.map((item, i) => (
            <div key={`${item.id}-${i}`} className="fl-cart__item">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.title} />
              ) : (
                <div style={{ width: 80, height: 100, background: 'var(--bone)', display: 'grid', placeItems: 'center', color: 'var(--ink-3)' }}>
                  <Icon name="flower" size={32} />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div className="serif" style={{ fontSize: 18, fontStyle: 'italic' }}>{item.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="btn" style={{ padding: '4px 10px', fontSize: 14 }}
                    data-hover
                  >
                    &minus;
                  </button>
                  <span className="mono" style={{ fontSize: 13 }}>{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="btn" style={{ padding: '4px 10px', fontSize: 14 }}
                    data-hover
                  >
                    +
                  </button>
                </div>
                <div className="mono" style={{ fontSize: 13, marginTop: 4 }}>{fmtPrice(item.price * item.quantity)}</div>
              </div>
              <button className="fl-cart__rm" onClick={() => removeItem(item.id)} data-hover>удалить</button>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <footer className="fl-cart__foot">
            <div className="fl-cart__total">
              <span className="eyebrow">Итого</span>
              <span className="serif" style={{ fontSize: 28, fontStyle: 'italic' }}>{fmtPrice(totalPrice())}</span>
            </div>
            <Link
              href="/checkout"
              onClick={onClose}
              className="btn btn--filled fl-cart__checkout"
              data-hover
            >
              Оформить заказ
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7H13M13 7L8 2M13 7L8 12" stroke="currentColor"/></svg>
            </Link>
          </footer>
        )}
      </aside>
    </>
  );
}
