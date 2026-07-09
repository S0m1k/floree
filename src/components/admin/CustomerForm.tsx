'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminCustomer, SimpleDictEntry } from '@/types';

const NAME_MAX = 64;
const EMAIL_MAX = 64;
const INSTAGRAM_MAX = 64;
const CARD_MAX = 32;
const COMMENT_MAX = 500;

interface Props {
  sources: SimpleDictEntry[];
  // Passed on /admin/customers/[id]/edit; absent on /admin/customers/create.
  customer?: AdminCustomer | null;
}

// Единая форма создания/редактирования клиента (admin-map §2.5.1) — секция
// «Информация о клиенте» в две колонки, как в живой Posiflora.
export default function CustomerForm({ sources, customer }: Props) {
  const router = useRouter();
  const isEdit = Boolean(customer);
  const a = customer?.attributes;

  const [name, setName] = useState(a?.title || '');
  const [phone, setPhone] = useState(a?.phone ? a.phone.replace(/^\+7/, '') : '');
  const [email, setEmail] = useState(a?.email || '');
  const [gender, setGender] = useState<string>(a?.gender || 'other');
  const [instagram, setInstagram] = useState(a?.instagram || '');
  const [customerType, setCustomerType] = useState<string>(a?.customerType || 'person');
  const [birthday, setBirthday] = useState(a?.birthday || '');
  const [sourceId, setSourceId] = useState(customer?.relationships?.source?.data?.id || '');
  const [preferences, setPreferences] = useState(a?.preferences || '');
  const [cardNumber, setCardNumber] = useState(a?.cardNumber || '');
  const [comment, setComment] = useState(a?.notes || '');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Укажите имя клиента'); return; }
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) { setError('Телефон должен содержать 10 цифр после +7'); return; }

    const attributes: Record<string, unknown> = {
      title: name.trim(),
      phone: `+7${digits}`,
      email: email.trim() || null,
      gender,
      instagram: instagram.trim() || null,
      customerType,
      birthday: birthday || null,
      preferences: preferences.trim() || null,
      cardNumber: cardNumber.trim() || null,
      notes: comment.trim() || null,
    };
    const relationships: Record<string, unknown> = {};
    if (sourceId) {
      relationships.source = { data: { type: 'order-sources', id: sourceId } };
    } else if (isEdit) {
      relationships.source = { data: null };
    }

    setSubmitting(true);
    try {
      const res = await fetch(isEdit ? `/admin/api/customers/${customer!.id}` : '/admin/api/customers', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: 'customers', attributes, relationships } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось сохранить клиента');
      }
      const id = json?.data?.id;
      if (!id) throw new Error('Сервер не вернул клиента');
      router.push(`/admin/customers/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="admin-customer-form">
      <section className="admin-panel">
        <p className="admin-panel__title">Информация о клиенте</p>

        <div className="admin-customer-form__grid">
          <div>
            <div className="admin-field">
              <label htmlFor="name">Имя *</label>
              <input
                id="name"
                value={name}
                maxLength={NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <span className="admin-form-counter">{name.length} / {NAME_MAX}</span>
            </div>

            <div className="admin-field">
              <label htmlFor="phone">Телефон *</label>
              <div className="admin-phone-row">
                <select aria-label="Код страны" defaultValue="7">
                  <option value="7">+7 (Россия)</option>
                </select>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="999 123-45-67"
                  required
                />
              </div>
            </div>

            <div className="admin-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                maxLength={EMAIL_MAX}
                onChange={(e) => setEmail(e.target.value)}
              />
              <span className="admin-form-counter">{email.length} / {EMAIL_MAX}</span>
            </div>

            <div className="admin-field">
              <label htmlFor="gender">Пол *</label>
              <select id="gender" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="female">Женский</option>
                <option value="male">Мужской</option>
                <option value="other">Не указан</option>
              </select>
            </div>

            <div className="admin-field">
              <label htmlFor="instagram">Инстаграм</label>
              <input
                id="instagram"
                value={instagram}
                maxLength={INSTAGRAM_MAX}
                onChange={(e) => setInstagram(e.target.value)}
              />
              <span className="admin-form-counter">{instagram.length} / {INSTAGRAM_MAX}</span>
            </div>

            <div className="admin-field">
              <label htmlFor="customerType">Тип клиента</label>
              <select id="customerType" value={customerType} onChange={(e) => setCustomerType(e.target.value)}>
                <option value="person">Физическое лицо</option>
                <option value="company">Юридическое лицо</option>
              </select>
            </div>

            <div className="admin-field">
              <label htmlFor="birthday">Дата рождения</label>
              <div className="admin-phone-row">
                <input
                  id="birthday"
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                />
                <button
                  type="button"
                  className="admin-btn admin-clear-btn"
                  onClick={() => setBirthday('')}
                  aria-label="Очистить дату рождения"
                  disabled={!birthday}
                >
                  ×
                </button>
              </div>
            </div>
          </div>

          <div>
            <div className="admin-field">
              <label htmlFor="source">Откуда узнал о нас</label>
              <select id="source" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">Не выбрано</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>{s.attributes.title}</option>
                ))}
              </select>
            </div>

            <div className="admin-field">
              <label htmlFor="preferences">Предпочтения</label>
              <input
                id="preferences"
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
              />
            </div>

            <div className="admin-field">
              <label htmlFor="cardNumber">Номер карты</label>
              <input
                id="cardNumber"
                value={cardNumber}
                maxLength={CARD_MAX}
                onChange={(e) => setCardNumber(e.target.value)}
              />
              <span className="admin-form-counter">{cardNumber.length} / {CARD_MAX}</span>
            </div>

            <div className="admin-field">
              <label htmlFor="comment">Комментарий</label>
              <textarea
                id="comment"
                className="admin-textarea"
                rows={4}
                value={comment}
                maxLength={COMMENT_MAX}
                onChange={(e) => setComment(e.target.value)}
              />
              <span className="admin-form-counter">{comment.length} / {COMMENT_MAX}</span>
            </div>
          </div>
        </div>
      </section>

      {error && <div className="admin-form-error">{error}</div>}

      <div className="admin-form-actions">
        <button
          type="button"
          className="admin-btn"
          onClick={() => router.push(isEdit ? `/admin/customers/${customer!.id}` : '/admin/customers')}
          disabled={submitting}
        >
          Отмена
        </button>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={submitting}>
          {submitting ? 'Сохраняем…' : isEdit ? 'Сохранить изменения' : 'Создать клиента'}
        </button>
      </div>
    </form>
  );
}
