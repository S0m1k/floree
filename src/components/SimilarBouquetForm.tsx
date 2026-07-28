'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const CONTACT_METHODS = ['Позвонить', 'Max', 'Telegram', 'WhatsApp'] as const;
type ContactMethod = (typeof CONTACT_METHODS)[number];

interface Props {
  recipeId: string;
  recipeTitle: string;
}

// Shown instead of the buy button when a bouquet cannot be ordered directly.
// Opens a callback form: we contact the client and agree on a similar bouquet.
export default function SimilarBouquetForm({ recipeId, recipeTitle }: Props) {
  const [isOpen, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState<ContactMethod>('Позвонить');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setStatus('sending');
    try {
      const res = await fetch(`${API_URL}/api/callback-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          contact_method: method,
          recipe_id: recipeId,
          recipe_title: recipeTitle,
        }),
      });
      setStatus(res.ok ? 'sent' : 'error');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="mb-8">
      <button className="fl-add-btn" onClick={() => setOpen(true)} data-hover>
        Собрать подобный
      </button>

      {isOpen && (
        <div className="fl-modal" role="dialog" aria-modal="true" aria-label="Собрать подобный букет">
          <div className="fl-modal__backdrop" onClick={() => setOpen(false)} />
          <div className="fl-modal__panel">
            <button className="fl-modal__close" onClick={() => setOpen(false)} aria-label="Закрыть">×</button>

            {status === 'sent' ? (
              <div>
                <h3 className="serif fl-modal__title">Заявка отправлена</h3>
                <p className="fl-modal__lede">
                  Мы свяжемся с вами в ближайшее время в удобном для вас формате
                  и согласуем букет с похожим составом.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <h3 className="serif fl-modal__title">Собрать подобный букет</h3>
                <p className="fl-modal__lede">
                  Мы свяжемся с вами в ближайшее время в удобном для вас формате
                  и согласуем букет с похожим составом.
                </p>

                <label className="fl-modal__label">
                  Имя
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                </label>

                <label className="fl-modal__label">
                  Телефон
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    autoComplete="tel"
                    placeholder="+7"
                  />
                </label>

                <fieldset className="fl-modal__methods">
                  <legend>Способ связи</legend>
                  {CONTACT_METHODS.map((m) => (
                    <label key={m} className="fl-modal__radio">
                      <input
                        type="radio"
                        name="contact-method"
                        value={m}
                        checked={method === m}
                        onChange={() => setMethod(m)}
                      />
                      {m}
                    </label>
                  ))}
                </fieldset>

                {status === 'error' && (
                  <p className="fl-modal__error">
                    Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам:{' '}
                    <a href="tel:+79930750577">+7 (993) 075-05-77</a>
                  </p>
                )}

                <button className="fl-add-btn" type="submit" disabled={status === 'sending'} data-hover>
                  {status === 'sending' ? 'Отправляем…' : 'Отправить'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
