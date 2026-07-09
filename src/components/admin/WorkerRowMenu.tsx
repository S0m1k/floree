'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ⋮ row menu on the «Сотрудники» table (admin-map §2.6.2):
// Приостановить/Активировать (PATCH status), Редактировать, Удалить (disabled
// — like the live Posiflora, deletion is not offered for referenced workers).
export default function WorkerRowMenu({ workerId, status }: { workerId: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActive = status === 'active';

  const toggleStatus = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/workers/${workerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            type: 'workers',
            attributes: { status: isActive ? 'inactive' : 'active' },
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось сменить статус');
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-row-menu">
      <button
        type="button"
        className="admin-btn admin-row-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋮
      </button>

      {open && (
        <ul className="admin-row-menu__list" role="menu">
          <li role="menuitem">
            <button type="button" className="admin-row-menu__item" onClick={toggleStatus} disabled={busy}>
              {isActive ? 'Приостановить' : 'Активировать'}
            </button>
          </li>
          <li role="menuitem">
            <button
              type="button"
              className="admin-row-menu__item"
              onClick={() => router.push(`/admin/staff/${workerId}/edit`)}
              disabled={busy}
            >
              Редактировать
            </button>
          </li>
          <li role="menuitem">
            <button type="button" className="admin-row-menu__item" disabled title="Пока недоступно">
              Удалить
            </button>
          </li>
        </ul>
      )}

      {error && <span className="admin-row-menu__error">{error}</span>}
    </div>
  );
}
