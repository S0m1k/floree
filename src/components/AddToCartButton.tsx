'use client';

import { useState } from 'react';
import { useCart } from '@/lib/cart';
import { CartItem } from '@/types';

interface Props {
  item: CartItem;
}

export default function AddToCartButton({ item }: Props) {
  const addItem = useCart((s) => s.addItem);
  const items = useCart((s) => s.items);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const removeItem = useCart((s) => s.removeItem);
  const [added, setAdded] = useState(false);

  const cartItem = items.find((i) => i.id === item.id);

  const handleAdd = () => {
    addItem(item);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  if (cartItem) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl overflow-hidden">
          <button
            onClick={() => updateQuantity(cartItem.id, cartItem.quantity - 1)}
            className="px-4 py-3 text-rose-600 hover:bg-rose-100 transition-colors font-bold text-lg"
            aria-label="Уменьшить"
          >
            −
          </button>
          <span className="w-8 text-center font-semibold text-gray-800">{cartItem.quantity}</span>
          <button
            onClick={() => updateQuantity(cartItem.id, cartItem.quantity + 1)}
            className="px-4 py-3 text-rose-600 hover:bg-rose-100 transition-colors font-bold text-lg"
            aria-label="Увеличить"
          >
            +
          </button>
        </div>
        <button
          onClick={() => removeItem(cartItem.id)}
          className="text-sm text-gray-400 hover:text-red-500 transition-colors"
        >
          Удалить
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleAdd}
      className={`w-full sm:w-auto px-10 py-4 rounded-2xl font-semibold text-base transition-all duration-300 shadow-lg ${
        added
          ? 'bg-green-600 text-white shadow-green-200 scale-95'
          : 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-200 hover:shadow-rose-300 hover:-translate-y-0.5'
      }`}
    >
      {added ? '✓ Добавлено в корзину' : 'Добавить в корзину'}
    </button>
  );
}
