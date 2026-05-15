'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import Reveal from '@/components/Reveal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fmtPrice = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' \u20BD';

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

      const orderRes = await fetch(`${API_URL}/api/orders`, {
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

      const payRes = await fetch(`${API_URL}/api/payments/init`, {
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
      window.location.href = pay.payment_url;
    } catch (err: any) {
      setError(err.message || 'Что-то пошло не так. Попробуйте снова.');
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="pg-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <p className="serif" style={{ fontSize: 36, fontStyle: 'italic', marginBottom: 16 }}>Корзина пуста</p>
          <p style={{ color: 'var(--ink-2)', marginBottom: 32 }}>Добавьте что-нибудь из каталога</p>
          <Link href="/catalog" className="btn btn--filled" data-hover>
            Перейти в каталог
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7H13M13 7L8 2M13 7L8 12" stroke="currentColor"/></svg>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pg-root">
      <div className="pg-crumbs">
        <Link href="/">Главная</Link>
        <span>/</span>
        <span className="pg-crumbs__current">Оформление заказа</span>
      </div>

      <div className="pg-co">
        <div>
          <Reveal kind="up">
            <h1 className="pg-co__title">Оформление <em>заказа</em></h1>
          </Reveal>

          <form onSubmit={handleSubmit}>
            <div className="pg-co__block">
              <div className="pg-co__block-head">
                <span className="mono">&mdash; 01 / получатель</span>
              </div>
              <div className="pg-co__form">
                <label className="pg-input">
                  <span>Имя получателя *</span>
                  <input type="text" name="customerName" value={form.customerName} onChange={handleChange} required />
                </label>
                <label className="pg-input">
                  <span>Телефон *</span>
                  <input type="tel" name="phone" value={form.phone} onChange={handleChange} placeholder="+7 999 000 00 00" required />
                </label>
              </div>
            </div>

            <div className="pg-co__block">
              <div className="pg-co__block-head">
                <span className="mono">&mdash; 02 / адрес и время</span>
              </div>
              <div className="pg-co__form">
                <label className="pg-input pg-input--full">
                  <span>Адрес доставки *</span>
                  <input type="text" name="address" value={form.address} onChange={handleChange} required />
                </label>
                <label className="pg-input">
                  <span>Дата доставки</span>
                  <input type="date" name="deliveryDate" value={form.deliveryDate} onChange={handleChange} min={new Date().toISOString().split('T')[0]} />
                </label>
                <label className="pg-input">
                  <span>Время доставки</span>
                  <input type="time" name="deliveryTime" value={form.deliveryTime} onChange={handleChange} />
                </label>
              </div>
            </div>

            <div className="pg-co__block">
              <div className="pg-co__block-head">
                <span className="mono">&mdash; 03 / комментарий</span>
              </div>
              <div className="pg-co__form">
                <label className="pg-input pg-input--full">
                  <span>Комментарий к заказу</span>
                  <textarea name="comment" value={form.comment} onChange={handleChange} rows={3} placeholder="Особые пожелания, подпись на открытке..." />
                </label>
              </div>
            </div>

            {error && <div className="pg-co__error">{error}</div>}

            <div className="pg-co__actions">
              <Link href="/catalog" className="btn" data-hover>&larr; Продолжить покупки</Link>
              <button type="submit" disabled={submitting} className="btn btn--filled" data-hover style={submitting ? { opacity: 0.6 } : {}}>
                {submitting ? 'Переходим к оплате...' : `Перейти к оплате \u00b7 ${fmtPrice(totalPrice())}`}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7H13M13 7L8 2M13 7L8 12" stroke="currentColor"/></svg>
              </button>
            </div>

            <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 24 }}>
              Нажимая кнопку, вы соглашаетесь с{' '}
              <Link href="/offer" style={{ textDecoration: 'underline' }}>офертой</Link>
              {' '}и{' '}
              <Link href="/privacy" style={{ textDecoration: 'underline' }}>политикой конфиденциальности</Link>
            </p>
          </form>
        </div>

        <aside className="pg-co__aside">
          <div className="pg-co__summary">
            <div className="eyebrow" style={{ marginBottom: 24 }}>&mdash; Заказ</div>
            <div className="pg-co__items">
              {items.map((item) => (
                <div key={item.id} className="pg-co__item">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.title} />
                  ) : (
                    <div style={{ width: 56, height: 70, background: 'var(--bone)', display: 'grid', placeItems: 'center' }}>{'\uD83C\uDF38'}</div>
                  )}
                  <div className="pg-co__item-meta">
                    <div className="serif" style={{ fontStyle: 'italic' }}>{item.title}</div>
                    <div className="pg-co__item-sub">{item.quantity} шт.</div>
                  </div>
                  <div className="mono" style={{ fontSize: 13 }}>{fmtPrice(item.price * item.quantity)}</div>
                </div>
              ))}
            </div>
            <div className="pg-co__rows">
              <div><span>Товары ({items.reduce((s, i) => s + i.quantity, 0)} шт.)</span><span className="mono">{fmtPrice(totalPrice())}</span></div>
              <div><span>Оплата</span><span className="mono">Т-Банк</span></div>
            </div>
            <div className="pg-co__total">
              <span className="eyebrow">Итого</span>
              <span className="serif" style={{ fontSize: 28, fontStyle: 'italic' }}>{fmtPrice(totalPrice())}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
