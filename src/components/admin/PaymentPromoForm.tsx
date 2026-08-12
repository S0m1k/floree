'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaymentSettingsAttributes, PromoCodeAttributes } from '@/lib/adminPayments';

// «Оплата и промокоды» (/admin/payment-settings): T-Bank acquiring keys and
// the storefront promo-code dictionary. Both are stored in the DB and win
// over the .env values, so rotation never needs SSH access.
export default function PaymentPromoForm({
  settings,
  promoCodes,
}: {
  settings: PaymentSettingsAttributes | null;
  promoCodes: PromoCodeAttributes[];
}) {
  const router = useRouter();

  // --- провайдер и ключи ---
  const [provider, setProvider] = useState<'tbank' | 'yandex'>(settings?.activeProvider || 'tbank');
  const [terminalKey, setTerminalKey] = useState(settings?.terminalKey || '');
  const [secretKey, setSecretKey] = useState('');
  const [yapayMerchantId, setYapayMerchantId] = useState(settings?.yapayMerchantId || '');
  const [yapayApiKey, setYapayApiKey] = useState('');
  const [yapaySandbox, setYapaySandbox] = useState(settings?.yapaySandbox ?? false);
  const [keysBusy, setKeysBusy] = useState(false);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [keysSaved, setKeysSaved] = useState(false);

  const saveKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setKeysBusy(true);
    setKeysError(null);
    setKeysSaved(false);
    try {
      const res = await fetch('/admin/api/payment-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            attributes: {
              activeProvider: provider,
              terminalKey: terminalKey.trim(),
              secretKey: secretKey.trim() || undefined,
              yapayMerchantId: yapayMerchantId.trim(),
              yapayApiKey: yapayApiKey.trim() || undefined,
              yapaySandbox,
            },
          },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || 'Не удалось сохранить');
      }
      setSecretKey('');
      setYapayApiKey('');
      setKeysSaved(true);
      router.refresh();
    } catch (err) {
      setKeysError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setKeysBusy(false);
    }
  };

  // --- promo codes ---
  const [newCode, setNewCode] = useState('');
  const [newPercent, setNewPercent] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const upsertPromo = async (code: string, percent: number, isActive: boolean) => {
    setPromoBusy(true);
    setPromoError(null);
    try {
      const res = await fetch('/admin/api/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { attributes: { code, percent, isActive } } }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || 'Не удалось сохранить промокод');
      }
      setNewCode('');
      setNewPercent('');
      router.refresh();
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : 'Не удалось сохранить промокод');
    } finally {
      setPromoBusy(false);
    }
  };

  const addPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    const percent = Number(newPercent.replace(',', '.'));
    if (!newCode.trim()) { setPromoError('Введите код'); return; }
    if (!(percent > 0 && percent <= 100)) { setPromoError('Скидка — число от 1 до 100'); return; }
    await upsertPromo(newCode.trim(), percent, true);
  };

  const removePromo = async (code: string) => {
    if (!window.confirm(`Удалить промокод ${code}?`)) return;
    setPromoBusy(true);
    setPromoError(null);
    try {
      const res = await fetch(`/admin/api/promo-codes/${encodeURIComponent(code)}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || 'Не удалось удалить');
      }
      router.refresh();
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : 'Не удалось удалить');
    } finally {
      setPromoBusy(false);
    }
  };

  return (
    <div>
      {/* ─── Ключи эквайринга ─── */}
      <form onSubmit={saveKeys} className="admin-panel admin-dict-form" style={{ marginBottom: 24 }}>
        <p className="admin-panel__title">Эквайринг Т-Банк</p>
        <p className="admin-form-note">
          Ключи терминала из личного кабинета Т-Банк Эквайринга. Заполненные здесь значения
          имеют приоритет над настройками сервера — после смены ключей в банке обновите их тут,
          перезапуск не нужен.
        </p>
        <div className="admin-form-grid" style={{ maxWidth: 560 }}>
          <label className="admin-field">
            <span className="admin-field__label">Активный провайдер оплаты</span>
            <select
              className="admin-input"
              value={provider}
              onChange={(e) => setProvider(e.target.value as 'tbank' | 'yandex')}
            >
              <option value="tbank">Т-Банк (эквайринг)</option>
              <option value="yandex">Yandex Pay</option>
            </select>
          </label>
          <label className="admin-field">
            <span className="admin-field__label">TerminalKey (Т-Банк)</span>
            <input
              className="admin-input"
              value={terminalKey}
              onChange={(e) => setTerminalKey(e.target.value)}
              placeholder="1746XXXXXXXXX"
              autoComplete="off"
            />
          </label>
          <label className="admin-field">
            <span className="admin-field__label">
              SecretKey (Т-Банк) {settings?.hasSecret ? '(задан — пусто = не менять)' : '(не задан)'}
            </span>
            <input
              className="admin-input"
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={settings?.hasSecret ? '••••••••' : 'секретный ключ терминала'}
              autoComplete="new-password"
            />
          </label>
          <label className="admin-field">
            <span className="admin-field__label">Merchant ID (Yandex Pay)</span>
            <input
              className="admin-input"
              value={yapayMerchantId}
              onChange={(e) => setYapayMerchantId(e.target.value)}
              placeholder="из console.pay.yandex.ru"
              autoComplete="off"
            />
          </label>
          <label className="admin-field">
            <span className="admin-field__label">
              API-ключ (Yandex Pay) {settings?.hasYapayApiKey ? '(задан — пусто = не менять)' : '(не задан)'}
            </span>
            <input
              className="admin-input"
              type="password"
              value={yapayApiKey}
              onChange={(e) => setYapayApiKey(e.target.value)}
              placeholder={settings?.hasYapayApiKey ? '••••••••' : 'ключ Merchant API'}
              autoComplete="new-password"
            />
          </label>
          <label className="admin-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={yapaySandbox}
              onChange={(e) => setYapaySandbox(e.target.checked)}
            />
            <span className="admin-field__label" style={{ margin: 0 }}>Песочница Yandex Pay (тестовый режим)</span>
          </label>
        </div>
        <p className="admin-form-note">
          Вебхук для консоли Yandex Pay: <code>https://floree.ru/api/payments/yandex-webhook</code>
        </p>
        {keysError && <div className="admin-form-error admin-dict-error">{keysError}</div>}
        {keysSaved && <p className="admin-form-note" style={{ color: 'var(--admin-accent)' }}>Сохранено</p>}
        <div className="admin-form-actions admin-dict-form__actions">
          <button type="submit" className="admin-btn admin-btn--primary" disabled={keysBusy}>
            {keysBusy ? 'Сохраняем…' : 'Сохранить ключи'}
          </button>
        </div>
      </form>

      {/* ─── Промокоды ─── */}
      <div className="admin-panel admin-dict-form">
        <p className="admin-panel__title">Промокоды витрины</p>
        <p className="admin-form-note">
          Скидка в процентах применяется к сумме заказа на сервере. Выключенный код
          покупатель применить не сможет.
        </p>

        <table className="admin-table" style={{ maxWidth: 560 }}>
          <thead>
            <tr>
              <th>Код</th>
              <th>Скидка</th>
              <th>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {promoCodes.length === 0 && (
              <tr><td colSpan={4} className="admin-form-note">Промокодов пока нет</td></tr>
            )}
            {promoCodes.map((p) => (
              <tr key={p.code}>
                <td style={{ fontWeight: 600 }}>{p.code}</td>
                <td>−{p.percent}%</td>
                <td>
                  <button
                    type="button"
                    className="admin-btn"
                    disabled={promoBusy}
                    onClick={() => upsertPromo(p.code, p.percent, !p.isActive)}
                    title="Переключить"
                  >
                    {p.isActive ? 'Активен' : 'Выключен'}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="admin-btn"
                    disabled={promoBusy}
                    onClick={() => removePromo(p.code)}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form onSubmit={addPromo} style={{ display: 'flex', gap: 8, marginTop: 16, maxWidth: 560 }}>
          <input
            className="admin-input"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="НОВЫЙКОД"
            style={{ flex: 2 }}
          />
          <input
            className="admin-input"
            value={newPercent}
            onChange={(e) => setNewPercent(e.target.value)}
            placeholder="15"
            inputMode="decimal"
            style={{ flex: 1 }}
          />
          <button type="submit" className="admin-btn admin-btn--primary" disabled={promoBusy}>
            Добавить
          </button>
        </form>
        {promoError && <div className="admin-form-error admin-dict-error">{promoError}</div>}
      </div>
    </div>
  );
}
