'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  customerId: string;
  customerName: string;
  editHref: string;
  // Where to navigate after a successful delete. Omit on the list page (it
  // just refreshes in place); pass '/admin/customers' on the detail page.
  afterDeleteHref?: string;
}

// Кебаб-меню «⋮» карточки/строки клиента: Редактировать / Удалить.
// Удаление запрещено бэкендом (409), если у клиента есть заказы — ошибка
// показывается прямо в меню, как в VendorRowActions.
export default function CustomerActionsMenu({ customerId, customerName, editHref, afterDeleteHref }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!window.confirm(`Удалить клиента «${customerName}»? Это действие необратимо.`)) return;
    setOpen(false);
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/admin/api/customers/${customerId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось удалить клиента');
      }
      if (afterDeleteHref) {
        router.push(afterDeleteHref);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setDeleting(false);
    }
  };

  return (
    <div className="admin-kebab">
      <button
        type="button"
        className="admin-kebab__trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={deleting}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Действия"
      >
        ⋮
      </button>

      {open && (
        <ul className="admin-kebab__menu" role="menu">
          <li role="menuitem">
            <button
              type="button"
              className="admin-kebab__item"
              onClick={() => { setOpen(false); router.push(editHref); }}
            >
              Редактировать
            </button>
          </li>
          <li role="menuitem">
            <button type="button" className="admin-kebab__item" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Удаляем…' : 'Удалить'}
            </button>
          </li>
        </ul>
      )}

      {error && <div className="admin-form-error" style={{ position: 'absolute', right: 0, whiteSpace: 'nowrap', zIndex: 11 }}>{error}</div>}
    </div>
  );
}
