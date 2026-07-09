'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminRole, SimpleDictEntry, Worker } from '@/types';

// Field limits — mirror the live Posiflora form counters (admin-map §2.6.2)
// and the backend validation in backend/app/routers/v1_staff.py.
const NAME_MAX = 32;
const LOGIN_MAX = 30;
const PASSWORD_MAX = 20;
const EMAIL_MAX = 64;
const PIN_LEN = 4;

const COUNTRY_CODE = '+7'; // Россия — the only option the live form offers.

interface Props {
  stores: SimpleDictEntry[];
  roles: AdminRole[];
  accessRightSets: string[];
  worker?: Worker | null; // present → edit mode
}

function splitPhone(full: string | null | undefined): string {
  if (!full) return '';
  return full.startsWith(COUNTRY_CODE) ? full.slice(COUNTRY_CODE.length) : full;
}

export default function WorkerForm({ stores, roles, accessRightSets, worker }: Props) {
  const router = useRouter();
  const isEdit = Boolean(worker);
  const a = worker?.attributes;

  // «Имя Фамилия» is assembled server-side; the parts come back separately.
  const initialFirstName = a
    ? (a.surname ? a.name.replace(a.surname, '').trim() : a.name)
    : '';

  const [surname, setSurname] = useState(a?.surname || '');
  const [firstName, setFirstName] = useState(initialFirstName);
  const [patronymic, setPatronymic] = useState(a?.patronymic || '');
  const [phone, setPhone] = useState(splitPhone(a?.phone));
  const [email, setEmail] = useState(a?.email || '');

  const [login, setLogin] = useState(a?.login || '');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [pin, setPin] = useState('');

  const [storeIds, setStoreIds] = useState<string[]>(a?.storeIds || []);
  const [accessRights, setAccessRights] = useState<string[]>(a?.accessRights || []);

  const initialRole = roles.find((r) => r.id === worker?.relationships?.role?.data?.id);
  const [roleTitle, setRoleTitle] = useState(initialRole?.attributes.title || '');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPasswordError(null);

    if (!surname.trim() || !firstName.trim()) { setError('Укажите фамилию и имя'); return; }
    if (!phone.trim()) { setError('Укажите телефон'); return; }
    if (password !== passwordRepeat) {
      setPasswordError('Пароли не совпадают');
      return;
    }
    if (pin && !(pin.length === PIN_LEN && /^\d+$/.test(pin))) {
      setError('ПИН-код — ровно 4 цифры');
      return;
    }

    const attributes: Record<string, unknown> = {
      firstName: firstName.trim(),
      surname: surname.trim(),
      patronymic: patronymic.trim(),
      phone: COUNTRY_CODE + phone.trim().replace(/^\+7/, ''),
      email: email.trim(),
      login: login.trim(),
      accessRights,
    };
    // Secrets go over the wire only when actually set; empty on edit = keep.
    if (password) attributes.password = password;
    if (pin) attributes.pin = pin;

    const relationships: Record<string, unknown> = {
      stores: { data: storeIds.map((id) => ({ type: 'stores', id })) },
    };
    const trimmedRole = roleTitle.trim();
    const existingRole = roles.find((r) => r.attributes.title === trimmedRole);
    if (existingRole) {
      relationships.role = { data: { type: 'roles', id: existingRole.id } };
    } else if (trimmedRole) {
      // Creatable select: an unknown title creates the Role server-side.
      attributes.roleTitle = trimmedRole;
    } else if (isEdit) {
      relationships.role = { data: null };
    }

    setSubmitting(true);
    try {
      const res = await fetch(isEdit ? `/admin/api/workers/${worker!.id}` : '/admin/api/workers', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: 'workers', attributes, relationships } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = typeof json.detail === 'string' ? json.detail : '';
        if (detail.includes('login')) throw new Error('Логин уже занят');
        throw new Error(detail || 'Не удалось сохранить сотрудника');
      }
      router.push('/admin/staff');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setSubmitting(false);
    }
  };

  const counter = (value: string, max: number) => (
    <span className="admin-form-counter">{value.length} / {max}</span>
  );

  return (
    <form onSubmit={handleSubmit} className="admin-worker-form">
      <div className="admin-worker-form__grid">
        <section className="admin-panel">
          <p className="admin-panel__title">Контактные данные</p>

          <div className="admin-field">
            <label htmlFor="surname">Фамилия *</label>
            <input id="surname" value={surname} maxLength={NAME_MAX} required
              onChange={(e) => setSurname(e.target.value)} />
            {counter(surname, NAME_MAX)}
          </div>

          <div className="admin-field">
            <label htmlFor="firstName">Имя *</label>
            <input id="firstName" value={firstName} maxLength={NAME_MAX} required
              onChange={(e) => setFirstName(e.target.value)} />
            {counter(firstName, NAME_MAX)}
          </div>

          <div className="admin-field">
            <label htmlFor="patronymic">Отчество</label>
            <input id="patronymic" value={patronymic} maxLength={NAME_MAX}
              onChange={(e) => setPatronymic(e.target.value)} />
            {counter(patronymic, NAME_MAX)}
          </div>

          <div className="admin-field">
            <label htmlFor="phone">Телефон *</label>
            <div className="admin-phone-row">
              <select aria-label="Код страны" value={COUNTRY_CODE} onChange={() => {}}>
                <option value="+7">+7 Россия</option>
              </select>
              <input id="phone" type="tel" value={phone} required placeholder="9991234567"
                onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="admin-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} maxLength={EMAIL_MAX}
              onChange={(e) => setEmail(e.target.value)} />
            {counter(email, EMAIL_MAX)}
          </div>
        </section>

        <section className="admin-panel">
          <p className="admin-panel__title">Доступы к системе</p>

          <p className="admin-form-subtitle">Вход в панель управления</p>
          <p className="admin-form-note">Укажите логин или электронную почту</p>

          <div className="admin-field">
            <label htmlFor="login">Имя пользователя</label>
            <input id="login" value={login} maxLength={LOGIN_MAX} autoComplete="off"
              onChange={(e) => setLogin(e.target.value)} />
            {counter(login, LOGIN_MAX)}
          </div>

          <div className="admin-field">
            <label htmlFor="password">Пароль</label>
            <input id="password" type="password" value={password} maxLength={PASSWORD_MAX}
              autoComplete="new-password"
              placeholder={isEdit && a?.hasPassword ? 'Оставьте пустым, чтобы не менять' : ''}
              onChange={(e) => setPassword(e.target.value)} />
            {counter(password, PASSWORD_MAX)}
          </div>

          <div className="admin-field">
            <label htmlFor="passwordRepeat">Повторите пароль</label>
            <input id="passwordRepeat" type="password" value={passwordRepeat} maxLength={PASSWORD_MAX}
              autoComplete="new-password"
              onChange={(e) => setPasswordRepeat(e.target.value)} />
            {counter(passwordRepeat, PASSWORD_MAX)}
            {passwordError && <span className="admin-field-error">{passwordError}</span>}
          </div>

          <p className="admin-form-subtitle">Вход в кассовое приложение</p>
          <p className="admin-form-note">Укажите четырехзначный ПИН-код</p>

          <div className="admin-field">
            <label htmlFor="pin">ПИН-код</label>
            <input id="pin" type="password" inputMode="numeric" value={pin} maxLength={PIN_LEN}
              autoComplete="off"
              placeholder={isEdit && a?.hasPin ? 'Оставьте пустым, чтобы не менять' : ''}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          </div>
        </section>

        <section className="admin-panel">
          <p className="admin-panel__title">Права доступа и место работы</p>

          <div className="admin-field">
            <label>Укажите точки продаж где работает сотрудник</label>
            <div className="admin-chips">
              {stores.map((s) => {
                const selected = storeIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`admin-chip ${selected ? 'admin-chip--active' : ''}`}
                    onClick={() => toggle(storeIds, setStoreIds, s.id)}
                  >
                    {s.attributes.title}
                    {selected && <span className="admin-chip__x" aria-hidden> ×</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="admin-field">
            <label>Укажите права доступа к программе</label>
            <div className="admin-chips">
              {accessRightSets.map((right) => {
                const selected = accessRights.includes(right);
                return (
                  <button
                    key={right}
                    type="button"
                    className={`admin-chip ${selected ? 'admin-chip--active' : ''}`}
                    onClick={() => toggle(accessRights, setAccessRights, right)}
                  >
                    {right}
                    {selected && <span className="admin-chip__x" aria-hidden> ×</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="admin-panel">
          <p className="admin-panel__title">Роли</p>
          <div className="admin-field">
            <label htmlFor="role">Роль</label>
            {/* Creatable select: pick an existing role or type a new one —
                an unknown title creates the Role on submit. */}
            <input id="role" list="worker-roles" value={roleTitle}
              placeholder="Выберите или введите новую"
              onChange={(e) => setRoleTitle(e.target.value)} />
            <datalist id="worker-roles">
              {roles.map((r) => (
                <option key={r.id} value={r.attributes.title} />
              ))}
            </datalist>
          </div>
        </section>
      </div>

      {error && <div className="admin-form-error">{error}</div>}

      <div className="admin-form-actions">
        <button type="button" className="admin-btn" onClick={() => router.push('/admin/staff')} disabled={submitting}>
          Отмена
        </button>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={submitting}>
          {submitting ? 'Сохраняем…' : 'Сохранить изменения'}
        </button>
      </div>
    </form>
  );
}
