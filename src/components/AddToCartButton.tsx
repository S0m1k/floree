'use client';

import { useEffect, useRef, useState } from 'react';
import { useCart } from '@/lib/cart';
import { useUi } from '@/lib/ui';
import { CartItem } from '@/types';

interface Props {
  item: CartItem;
}

export default function AddToCartButton({ item }: Props) {
  const addItem = useCart((s) => s.addItem);
  const items = useCart((s) => s.items);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const removeItem = useCart((s) => s.removeItem);
  const openCartDrawer = useUi((s) => s.openCartDrawer);
  const [toastShown, setToastShown] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const cartItem = items.find((i) => i.id === item.id);

  const handleAdd = () => {
    addItem(item);
    setToastShown(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastShown(false), 4000);
  };

  const toast = (
    <div className={`fl-toast ${toastShown ? 'is-shown' : ''}`} role="status" aria-live="polite">
      <div className="fl-toast__head">
        <span>Добавлено в корзину</span>
        <button className="fl-toast__close" onClick={() => setToastShown(false)} aria-label="Закрыть">×</button>
      </div>
      <div className="fl-toast__title">{item.title}</div>
      <button
        className="fl-toast__go"
        onClick={() => { setToastShown(false); openCartDrawer(); }}
        data-hover
      >
        Перейти в корзину →
      </button>
    </div>
  );

  if (cartItem) {
    return (
      <>
        <div className="fl-qty">
          <div className="fl-qty__stepper">
            <button onClick={() => updateQuantity(cartItem.id, cartItem.quantity - 1)} aria-label="Уменьшить">−</button>
            <span>{cartItem.quantity}</span>
            <button onClick={() => updateQuantity(cartItem.id, cartItem.quantity + 1)} aria-label="Увеличить">+</button>
          </div>
          <button className="fl-qty__remove" onClick={() => removeItem(cartItem.id)}>
            Удалить
          </button>
        </div>
        {toast}
      </>
    );
  }

  return (
    <>
      <button className="fl-add-btn" onClick={handleAdd} data-hover>
        Добавить в корзину
      </button>
      {toast}
    </>
  );
}
