'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminRole, RolePermissions } from '@/types';

// «Приложения POS и Florist» permissions editor (admin-map §2.6.3): the
// discounts-and-markups accordion with five boolean flags, saved as the
// role's permissions JSON via PATCH /v1/roles/{id}.

type PermKey = keyof RolePermissions;

const ORDER_GROUP: { key: PermKey; label: string }[] = [
  { key: 'orderDiscount', label: 'Доступ к скидке на заказ' },
  { key: 'orderMarkup', label: 'Доступ к надбавке на заказ' },
];

const BOUQUET_GROUP: { key: PermKey; label: string }[] = [
  { key: 'bouquetDiscount', label: 'Доступ к скидке на букет' },
  { key: 'bouquetMarkup', label: 'Доступ к надбавке на букет' },
];

const HINT_ORDER =
  'При отключении доступа к скидке или надбавке на заказ, установка своей цены в заказе будет ограничена';
const HINT_BOUQUET =
  'При отключении доступа к скидке или надбавке на букет, установка своей цены в заказе будет ограничена';

function normalize(p: RolePermissions | null): Required<RolePermissions> {
  return {
    orderDiscount: p?.orderDiscount ?? false,
    orderMarkup: p?.orderMarkup ?? false,
    bouquetDiscount: p?.bouquetDiscount ?? false,
    bouquetMarkup: p?.bouquetMarkup ?? false,
    customItemPrice: p?.customItemPrice ?? false,
  };
}

export default function RolePermissionsForm({ role }: { role: AdminRole }) {
  const router = useRouter();
  const initial = normalize(role.attributes.permissions);

  const [perms, setPerms] = useState(initial);
  const [expanded, setExpanded] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = (Object.keys(perms) as PermKey[]).some((k) => perms[k] !== initial[k]);

  const toggle = (key: PermKey) => {
    setPerms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/admin/api/roles/${role.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: 'roles', attributes: { permissions: perms } } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось сохранить');
      }
      router.push('/admin/roles');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setSubmitting(false);
    }
  };

  const checkbox = (key: PermKey, label: string) => (
    <label key={key} className="admin-checkbox">
      <input type="checkbox" checked={perms[key]} onChange={() => toggle(key)} />
      <span>{label}</span>
    </label>
  );

  return (
    <form onSubmit={handleSubmit}>
      <section className="admin-panel admin-accordion">
        <button
          type="button"
          className="admin-accordion__header"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          Ограничения по скидкам и надбавкам
          <span className="admin-accordion__caret" aria-hidden>{expanded ? '▴' : '▾'}</span>
        </button>

        {expanded && (
          <div className="admin-accordion__body">
            <div className="admin-perm-group">
              <p className="admin-perm-group__title">Скидки и надбавки на заказ</p>
              {ORDER_GROUP.map((item) => checkbox(item.key, item.label))}
              <p className="admin-perm-hint">{HINT_ORDER}</p>
            </div>

            <div className="admin-perm-group">
              <p className="admin-perm-group__title">Скидки и надбавки на букет</p>
              {BOUQUET_GROUP.map((item) => checkbox(item.key, item.label))}
              <p className="admin-perm-hint">{HINT_BOUQUET}</p>
            </div>

            <div className="admin-perm-group">
              {checkbox('customItemPrice', 'Доступ к установке своей цены на товар')}
            </div>
          </div>
        )}
      </section>

      {error && <div className="admin-form-error" style={{ marginTop: 12 }}>{error}</div>}

      <div className="admin-form-actions" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="admin-btn"
          onClick={() => router.push('/admin/roles')}
          disabled={submitting || !isDirty}
        >
          Отмена
        </button>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={submitting}>
          {submitting ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
    </form>
  );
}
