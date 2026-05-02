'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/lib/cart';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const initialForm = {
  customerName: '',
  phone: '',
  address: '',
  deliveryDate: '',
  deliveryTime: '',
  comment: '',
};

export default function CheckoutPage() {
  const items = useCart((s) => s.items);
  const totalPrice = useCart((s) => s.totalPrice);
  const clearCart = useCart((s) => s.clearCart);

  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatPrice = (price: number) => new Intl.NumberFormat('ru-RU').format(Math.round(price));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) { setError('Корзина пуста'); return; }
    if (!form.customerName.trim() || !form.phone.trim() || !form.address.trim()) {
      setError('Заполните все обязательные поля');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let dueTime: string | undefined;
      if (form.deliveryDate) {
        const timeStr = form.deliveryTime || '12:00';
        dueTime = `${form.deliveryDate}T${timeStr}:00+00:00`;
      }

      // 1. Create order in backend → Posiflora
      const orderRes = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: form.customerName,
          phone: form.phone,
          address: form.address,
          comment: form.comment || null,
          due_time: dueTime || null,
          bouquet_ids: items.map((i) => i.id),
          total_amount: Math.round(totalPrice()),
        }),
      });

      if (!orderRes.ok) {
        const d = await orderRes.json();
        throw new Error(d.detail || 'Ошибка создания заказа');
      }
      const order = await orderRes.json();

      // 2. Init T-Bank payment → get PaymentURL
      const payRes = await fetch(`${API_URL}/payments/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id }),
      });

      if (!payRes.ok) {
        const d = await payRes.json();
        throw new Error(d.detail || 'Ошибка инициализации оплаты');
      }
      const pay = await payRes.json();

      clearCart();

      // 3. Redirect to T-Bank payment page
      window.location.href = pay.payment_url;
    } catch (err: any) {
      setError(err.message || 'Что-то пошло не так. Попробуйте снова.');
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50/30 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center bg-white rounded-3xl p-10 shadow-lg">
          <div className="text-7xl mb-6">🛒</div>
          <h1 className="font-serif text-2xl font-bold text-gray-800 mb-3">Корзина пуста</h1>
          <p className="text-gray-500 mb-8">Добавьте что-нибудь из нашей витрины</p>
          <Link href="/catalog" className="inline-flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-semibold px-8 py-3.5 rounded-2xl transition-colors">
            Перейти на витрину
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/30">
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <nav className="flex items-center gap-2 text-sm text-gray-400 mb-4">
            <Link href="/" className="hover:text-rose-500 transition-colors">Главная</Link>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-600 font-medium">Оформление заказа</span>
          </nav>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-gray-800">Оформление заказа</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Form */}
          <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">
            <h2 className="font-semibold text-xl text-gray-800 mb-6 flex items-center gap-2">
              <span className="w-7 h-7 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center text-sm font-bold">1</span>
              Данные для доставки
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Ваше имя <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text" name="customerName" value={form.customerName} onChange={handleChange}
                  placeholder="Иван Иванов" required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 transition-all text-gray-800 placeholder-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Телефон <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel" name="phone" value={form.phone} onChange={handleChange}
                  placeholder="+7 999 000-00-00" required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 transition-all text-gray-800 placeholder-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Адрес доставки <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text" name="address" value={form.address} onChange={handleChange}
                  placeholder="ул. Цветочная, д. 1, кв. 1" required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 transition-all text-gray-800 placeholder-gray-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Дата доставки</label>
                  <input
                    type="date" name="deliveryDate" value={form.deliveryDate} onChange={handleChange}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 transition-all text-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Время доставки</label>
                  <input
                    type="time" name="deliveryTime" value={form.deliveryTime} onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 transition-all text-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Комментарий</label>
                <textarea
                  name="comment" value={form.comment} onChange={handleChange}
                  placeholder="Особые пожелания, подпись на открытке..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 transition-all text-gray-800 placeholder-gray-400 resize-none"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={submitting}
                className="w-full bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 text-white font-semibold py-4 rounded-xl transition-colors text-base shadow-lg shadow-rose-100 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Переходим к оплате...
                  </span>
                ) : (
                  `Перейти к оплате · ${formatPrice(totalPrice())} ₽`
                )}
              </button>

              <p className="text-xs text-gray-400 text-center">
                Нажимая кнопку, вы соглашаетесь с{' '}
                <Link href="/offer" className="underline hover:text-gray-600">офертой</Link>
                {' '}и{' '}
                <Link href="/privacy" className="underline hover:text-gray-600">политикой конфиденциальности</Link>
              </p>
            </form>
          </div>

          {/* Order summary */}
          <div>
            <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8 sticky top-24">
              <h2 className="font-semibold text-xl text-gray-800 mb-6 flex items-center gap-2">
                <span className="w-7 h-7 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                Ваш заказ
              </h2>

              <ul className="divide-y divide-gray-50 mb-6">
                {items.map((item) => (
                  <li key={item.id} className="flex gap-4 py-4">
                    <div className="relative w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden bg-rose-50">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.title} fill className="object-cover" sizes="64px" unoptimized />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl">🌸</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 line-clamp-2">{item.title}</p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-gray-400">{item.quantity} шт.</p>
                        <p className="text-sm font-semibold text-gray-800">{formatPrice(item.price * item.quantity)} ₽</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="border-t border-gray-100 pt-4 space-y-2">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Товары ({items.reduce((s, i) => s + i.quantity, 0)} шт.)</span>
                  <span>{formatPrice(totalPrice())} ₽</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Доставка</span>
                  <span className="text-green-600 font-medium">Бесплатно</span>
                </div>
                <div className="flex justify-between font-bold text-lg text-gray-800 pt-2 border-t border-gray-100 mt-2">
                  <span>Итого</span>
                  <span className="text-rose-600">{formatPrice(totalPrice())} ₽</span>
                </div>
              </div>

              <div className="mt-4 p-3 bg-gray-50 rounded-xl text-xs text-gray-500 text-center">
                Оплата через T-Bank — безопасный эквайринг
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
