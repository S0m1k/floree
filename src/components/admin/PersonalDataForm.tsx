'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PersonalDataAttributes } from '@/lib/adminSettings';

const INN_RE = /^\d{10}$|^\d{12}$/;

// «Форма заполнения политики» (admin-map §2.7): editable template of the
// personal-data processing consent — ИП/ООО title, ИНН (10–12 digits), legal
// address, website, email. Сохранить / Отмена.
export default function PersonalDataForm({ initial }: { initial: PersonalDataAttributes | null }) {
  const router = useRouter();
  const [ipTitle, setIpTitle] = useState(initial?.ipTitle || '');
  const [inn, setInn] = useState(initial?.inn || '');
  const [legalAddress, setLegalAddress] = useState(initial?.legalAddress || '');
  const [website, setWebsite] = useState(initial?.website || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [innError, setInnError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const resetToInitial = () => {
    setIpTitle(initial?.ipTitle || '');
    setInn(initial?.inn || '');
    setLegalAddress(initial?.legalAddress || '');
    setWebsite(initial?.website || '');
    setEmail(initial?.email || '');
    setError(null);
    setInnError(null);
    setSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInnError(null);
    setSaved(false);

    const trimmedInn = inn.trim();
    if (trimmedInn && !INN_RE.test(trimmedInn)) {
      setInnError('ИНН — 10 или 12 цифр');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/admin/api/personal-data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            type: 'personal-data-template',
            attributes: {
              ipTitle: ipTitle.trim(),
              inn: trimmedInn,
              legalAddress: legalAddress.trim(),
              website: website.trim(),
              email: email.trim(),
            },
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = typeof json.detail === 'string' ? json.detail : '';
        if (detail.includes('inn')) {
          setInnError('ИНН — 10 или 12 цифр');
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
      <p className="admin-panel__title">Согласие на обработку персональных данных</p>
      <p className="admin-form-note">
        Эти реквизиты подставляются в текст согласия на обработку персональных данных для клиентов.
      </p>

      <div className="admin-field">
        <label htmlFor="pd-ip">Наименование ИП/ООО</label>
        <input id="pd-ip" value={ipTitle} onChange={(e) => setIpTitle(e.target.value)} />
      </div>

      <div className="admin-field">
        <label htmlFor="pd-inn">ИНН</label>
        <input
          id="pd-inn"
          inputMode="numeric"
          maxLength={12}
          value={inn}
          placeholder="10 или 12 цифр"
          onChange={(e) => setInn(e.target.value.replace(/\D/g, ''))}
        />
        {innError && <span className="admin-field-error">{innError}</span>}
      </div>

      <div className="admin-field">
        <label htmlFor="pd-address">Юридический адрес</label>
        <input id="pd-address" value={legalAddress} onChange={(e) => setLegalAddress(e.target.value)} />
      </div>

      <div className="admin-field">
        <label htmlFor="pd-website">Сайт</label>
        <input id="pd-website" value={website} placeholder="https://" onChange={(e) => setWebsite(e.target.value)} />
      </div>

      <div className="admin-field">
        <label htmlFor="pd-email">Email</label>
        <input id="pd-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
