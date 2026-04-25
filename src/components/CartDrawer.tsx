'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/lib/cart';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CartDrawer({ open, onClose }: Props) {
  const items = useCart((s) => s.items);
  const removeItem = useCart((s) => s.removeItem);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const totalPrice = useCart((s) => s.totalPrice);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('ru-RU').format(Math.round(price));

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-label="Корзина"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-serif text-xl font-semibold text-gray-800">
            Корзина
            {items.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({items.length} {items.length === 1 ? 'товар' : items.length < 5 ? 'товара' : 'товаров'})
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Закрыть"
          >
            <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="text-7xl mb-4">🌷</div>
              <p className="text-gray-500 text-lg font-medium">Корзина пуста</p>
              <p className="text-gray-400 text-sm mt-1">Добавьте что-нибудь из каталога</p>
              <button
                onClick={onClose}
                className="mt-6 px-6 py-2.5 bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-colors font-medium text-sm"
              >
                Перейти в каталог
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 -mx-2">
              {items.map((item) => (
                <li key={item.id} className="flex gap-4 py-4 px-2">
                  {/* Image */}
                  <div className="relative w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden bg-rose-50">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.title}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-3xl">🌸</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm leading-snug line-clamp-2">
                      {item.title}
                    </p>
                    <p className="text-rose-600 font-semibold text-sm mt-1">
                      {formatPrice(item.price)} ₽
                    </p>

                    {/* Quantity controls */}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:border-rose-400 hover:text-rose-500 transition-colors text-gray-600 font-medium text-lg leading-none"
                        aria-label="Уменьшить"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-semibold text-gray-700">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:border-rose-400 hover:text-rose-500 transition-colors text-gray-600 font-medium text-lg leading-none"
                        aria-label="Увеличить"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors self-start mt-1"
                    aria-label="Удалить"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-6 py-5 border-t border-gray-100 bg-gray-50/50">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-600 font-medium">Итого:</span>
              <span className="text-xl font-bold text-gray-800">
                {formatPrice(totalPrice())} ₽
              </span>
            </div>
            <Link
              href="/checkout"
              onClick={onClose}
              className="block w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3.5 rounded-xl text-center transition-colors"
            >
              Оформить заказ
            </Link>
            <button
              onClick={onClose}
              className="mt-3 w-full text-gray-500 hover:text-gray-700 text-sm py-2 transition-colors"
            >
              Продолжить покупки
            </button>
          </div>
        )}
      </div>
    </>
  );
}
