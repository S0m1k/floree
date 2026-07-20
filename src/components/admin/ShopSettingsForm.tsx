'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShopSettingsAttributes } from '@/lib/adminShop';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_DIGITS_RE = /^\d{4,15}$/;

// «Онлайн-витрина» settings form (admin-map §2.3.2): shop title, contact
// info, socials, the «Витрина включена» switch and an announcement banner
// for our public storefront (floree.ru). Сохранить / Отмена.
export default function ShopSettingsForm({ initial }: { initial: ShopSettingsAttributes | null }) {
  const router = useRouter();
  const [shopTitle, setShopTitle] = useState(initial?.shopTitle || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [address, setAddress] = useState(initial?.address || '');
  const [emailOrders, setEmailOrders] = useState(initial?.emailOrders || '');
  const [instagram, setInstagram] = useState(initial?.instagram || '');
  const [telegram, setTelegram] = useState(initial?.telegram || '');
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp || '');
  const [isEnabled, setIsEnabled] = useState(initial?.isEnabled ?? true);
  const [announcement, setAnnouncement] = useState(initial?.announcement || '');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const resetToInitial = () => {
    setShopTitle(initial?.shopTitle || '');
    setPhone(initial?.phone || '');
    setAddress(initial?.address || '');
    setEmailOrders(initial?.emailOrders || '');
    setInstagram(initial?.instagram || '');
    setTelegram(initial?.telegram || '');
    setWhatsapp(initial?.whatsapp || '');
    setIsEnabled(initial?.isEnabled ?? true);
    setAnnouncement(initial?.announcement || '');
    setError(null);
    setEmailError(null);
    setPhoneError(null);
    setSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEmailError(null);
    setPhoneError(null);
    setSaved(false);

    const trimmedEmail = emailOrders.trim();
    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
      setEmailError('Некорректный email');
      return;
    }
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !PHONE_DIGITS_RE.test(trimmedPhone.replace(/\D/g, ''))) {
      setPhoneError('Телефон — от 4 до 15 цифр');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/admin/api/shop-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            type: 'shop-settings',
            attributes: {
              shopTitle: shopTitle.trim(),
              phone: trimmedPhone,
              address: address.trim(),
              emailOrders: trimmedEmail,
              instagram: instagram.trim(),
              telegram: telegram.trim(),
              whatsapp: whatsapp.trim(),
              isEnabled,
              announcement: announcement.trim(),
            },
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = typeof json.detail === 'string' ? json.detail : '';
        if (detail.includes('email')) {
          setEmailError('Некорректный email');
          return;
        }
        if (detail.includes('phone')) {
          setPhoneError('Телефон — от 4 до 15 цифр');
          return;
        }
        throw new Error(detail || 'Не удалось сохранить');
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="admin-panel admin-dict-form admin-personal-data-form">
      <p className="admin-panel__title">Настройки витрины</p>
      <p className="admin-form-note">
        Применяется при следующем деплое витрины — сами страницы floree.ru пока не читают эти настройки автоматически.
      </p>

      <div className="admin-field">
        <label htmlFor="shop-title">Название магазина</label>
        <input id="shop-title" value={shopTitle} onChange={(e) => setShopTitle(e.target.value)} />
      </div>

      <div className="admin-field">
        <label htmlFor="shop-phone">Телефон</label>
        <input id="shop-phone" value={phone} placeholder="+7 900 000-00-00" onChange={(e) => setPhone(e.target.value)} />
        {phoneError && <span className="admin-field-error">{phoneError}</span>}
      </div>

      <div className="admin-field">
        <label htmlFor="shop-address">Адрес</label>
        <input id="shop-address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>

      <div className="admin-field">
        <label htmlFor="shop-email">Email для заказов</label>
        <input
          id="shop-email"
          type="email"
          value={emailOrders}
          placeholder="orders@floree.ru"
          onChange={(e) => setEmailOrders(e.target.value)}
        />
        {emailError && <span className="admin-field-error">{emailError}</span>}
        <span className="admin-form-note" style={{ padding: 0 }}>
          Куда приходят уведомления о новых заказах с сайта.
        </span>
      </div>

      <div className="admin-field">
        <label htmlFor="shop-instagram">Instagram</label>
        <input id="shop-instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
      </div>

      <div className="admin-field">
        <label htmlFor="shop-telegram">Telegram</label>
        <input id="shop-telegram" value={telegram} onChange={(e) => setTelegram(e.target.value)} />
      </div>

      <div className="admin-field">
        <label htmlFor="shop-whatsapp">WhatsApp</label>
        <input id="shop-whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
      </div>

      <div className="admin-field">
        <label className="admin-switch">
          <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
          <span className="admin-switch__track" />
          <span className="admin-switch__label">Витрина включена</span>
        </label>
      </div>

      <div className="admin-field">
        <label htmlFor="shop-announcement">Текст объявления</label>
        <textarea
          id="shop-announcement"
          rows={3}
          value={announcement}
          placeholder="Например: скидка 10% на розы до конца недели"
          onChange={(e) => setAnnouncement(e.target.value)}
        />
      </div>

      {error && <div className="admin-form-error admin-dict-error">{error}</div>}
      {saved && <div className="admin-dict-saved">Сохранено</div>}

      <div className="admin-form-actions admin-dict-form__actions">
        <button type="button" className="admin-btn" onClick={resetToInitial} disabled={busy}>
          Отмена
        </button>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={busy}>
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
    </form>
  );
}
