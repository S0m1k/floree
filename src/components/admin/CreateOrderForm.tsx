'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminCustomer, SimpleDictEntry } from '@/types';

const COMMENT_MAX = 500;

interface Props {
  stores: SimpleDictEntry[];
  sources: SimpleDictEntry[];
  tags: SimpleDictEntry[];
  customers: AdminCustomer[];
}

type DeliveryType = 'pickup' | 'delivery';
type WhenPreset = 'today' | 'tomorrow' | 'aftertomorrow' | 'other';

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

const WHEN_PRESETS: { value: WhenPreset; label: string; offset: number | null }[] = [
  { value: 'today', label: 'Сегодня', offset: 0 },
  { value: 'tomorrow', label: 'Завтра', offset: 1 },
  { value: 'aftertomorrow', label: 'Послезавтра', offset: 2 },
  { value: 'other', label: 'Другая дата', offset: null },
];

export default function CreateOrderForm({ stores, sources, tags, customers }: Props) {
  const router = useRouter();

  const [storeId, setStoreId] = useState(stores.length === 1 ? stores[0].id : '');
  const [customerId, setCustomerId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [budget, setBudget] = useState('');
  const [comment, setComment] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('delivery');
  const [address, setAddress] = useState({ city: 'Санкт-Петербург', street: '', house: '', apartment: '' });
  const [whenPreset, setWhenPreset] = useState<WhenPreset>('today');
  const [otherDate, setOtherDate] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dueDate = useMemo(() => {
    const preset = WHEN_PRESETS.find((p) => p.value === whenPreset);
    if (!preset) return '';
    return preset.offset === null ? otherDate : isoDate(preset.offset);
  }, [whenPreset, otherDate]);

  const toggleTag = (id: string) => {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!storeId) { setError('Выберите точку продаж'); return; }
    if (!sourceId) { setError('Выберите источник сделки'); return; }
    if (comment.length > COMMENT_MAX) { setError(`Комментарий не длиннее ${COMMENT_MAX} символов`); return; }
    if (deliveryType === 'delivery' && (!address.street.trim() || !address.house.trim())) {
      setError('Укажите улицу и дом для доставки');
      return;
    }
    if (whenPreset === 'other' && !otherDate) { setError('Выберите дату выполнения'); return; }

    const attributes: Record<string, unknown> = {
      delivery: deliveryType,
      dueDate: dueDate || null,
      deliveryTimeFrom: timeFrom || null,
      deliveryTimeTo: timeTo || null,
    };
    if (budget.trim()) attributes.budget = Number(budget);
    if (comment.trim()) attributes.comment = comment;
    if (deliveryType === 'delivery') {
      attributes.deliveryCity = address.city || null;
      attributes.deliveryStreet = address.street || null;
      attributes.deliveryHouse = address.house || null;
      attributes.deliveryApartment = address.apartment || null;
    }

    const relationships: Record<string, unknown> = {
      store: { data: { type: 'stores', id: storeId } },
      source: { data: { type: 'order-sources', id: sourceId } },
    };
    if (customerId) relationships.customer = { data: { type: 'customers', id: customerId } };
    if (tagIds.length) relationships.tags = { data: tagIds.map((id) => ({ type: 'order-tags', id })) };

    setSubmitting(true);
    try {
      const res = await fetch('/admin/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: 'orders', attributes, relationships } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось создать заказ');
      }
      const id = json?.data?.id;
      if (!id) throw new Error('Сервер не вернул созданный заказ');
      router.push(`/admin/orders/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="admin-order-form">
      <section className="admin-panel">
        <p className="admin-panel__title">Точка продаж и клиент</p>
        <div className="admin-field">
          <label htmlFor="store">Точка продаж *</label>
          <select id="store" value={storeId} onChange={(e) => setStoreId(e.target.value)} required>
            <option value="">Выберите точку продаж</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.attributes.title}</option>
            ))}
          </select>
        </div>

        <div className="admin-field">
          <label htmlFor="customer">Клиент</label>
          <select id="customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Без клиента</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.attributes.title || 'Без имени')} · {c.attributes.phone}
              </option>
            ))}
          </select>
          <span className="admin-form-hint admin-form-hint--disabled" aria-disabled title="Скоро">
            + Создать нового клиента
          </span>
        </div>

        <div className="admin-field">
          <label>Источник сделки *</label>
          <div className="admin-chips">
            {sources.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`admin-chip ${sourceId === s.id ? 'admin-chip--active' : ''}`}
                onClick={() => setSourceId(s.id)}
              >
                {s.attributes.title}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="admin-panel">
        <p className="admin-panel__title">Детали заказа</p>
        <div className="admin-field">
          <label htmlFor="budget">Бюджет, ₽</label>
          <input
            id="budget"
            type="number"
            min="0"
            step="1"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="Ориентир, не итоговая цена"
          />
        </div>

        <div className="admin-field">
          <label htmlFor="comment">Комментарий</label>
          <textarea
            id="comment"
            value={comment}
            maxLength={COMMENT_MAX}
            rows={3}
            onChange={(e) => setComment(e.target.value)}
            className="admin-textarea"
          />
          <span className="admin-form-counter">{comment.length} / {COMMENT_MAX}</span>
        </div>

        {tags.length > 0 && (
          <div className="admin-field">
            <label>Быстрые теги</label>
            <div className="admin-chips">
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`admin-chip ${tagIds.includes(t.id) ? 'admin-chip--active' : ''}`}
                  onClick={() => toggleTag(t.id)}
                >
                  {t.attributes.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="admin-panel">
        <p className="admin-panel__title">Получение заказа</p>
        <div className="admin-field">
          <div className="admin-chips">
            {(['pickup', 'delivery'] as DeliveryType[]).map((dt) => (
              <button
                key={dt}
                type="button"
                className={`admin-chip ${deliveryType === dt ? 'admin-chip--active' : ''}`}
                onClick={() => setDeliveryType(dt)}
              >
                {dt === 'pickup' ? 'Самовывоз' : 'Доставка'}
              </button>
            ))}
          </div>
        </div>

        {deliveryType === 'delivery' && (
          <div className="admin-field-grid">
            <div className="admin-field">
              <label htmlFor="city">Город</label>
              <input id="city" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
            </div>
            <div className="admin-field">
              <label htmlFor="street">Улица *</label>
              <input id="street" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} placeholder="Невский проспект" />
            </div>
            <div className="admin-field">
              <label htmlFor="house">Дом *</label>
              <input id="house" value={address.house} onChange={(e) => setAddress({ ...address, house: e.target.value })} placeholder="12А" />
            </div>
            <div className="admin-field">
              <label htmlFor="apartment">Квартира / офис</label>
              <input id="apartment" value={address.apartment} onChange={(e) => setAddress({ ...address, apartment: e.target.value })} placeholder="34" />
            </div>
          </div>
        )}
      </section>

      <section className="admin-panel">
        <p className="admin-panel__title">Когда выполнить</p>
        <div className="admin-field">
          <div className="admin-chips">
            {WHEN_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`admin-chip ${whenPreset === p.value ? 'admin-chip--active' : ''}`}
                onClick={() => setWhenPreset(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {whenPreset === 'other' && (
          <div className="admin-field">
            <label htmlFor="otherDate">Дата</label>
            <input id="otherDate" type="date" min={isoDate(0)} value={otherDate} onChange={(e) => setOtherDate(e.target.value)} />
          </div>
        )}

        <div className="admin-field-grid">
          <div className="admin-field">
            <label htmlFor="timeFrom">Время с</label>
            <input id="timeFrom" type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
          </div>
          <div className="admin-field">
            <label htmlFor="timeTo">Время до</label>
            <input id="timeTo" type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
          </div>
        </div>
      </section>

      {error && <div className="admin-form-error">{error}</div>}

      <div className="admin-form-actions">
        <button type="button" className="admin-btn" onClick={() => router.push('/admin/orders')} disabled={submitting}>
          Отмена
        </button>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={submitting}>
          {submitting ? 'Создаём…' : 'Создать заказ'}
        </button>
      </div>
    </form>
  );
}
