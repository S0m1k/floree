'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  editHref: string;
  // «Удалить» есть в живой Posiflora, но пока не реализовано — disabled.
  showDelete?: boolean;
}

// Кебаб-меню «⋮» карточки/строки клиента: Редактировать (+ Удалить disabled).
export default function CustomerActionsMenu({ editHref, showDelete = true }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="admin-kebab">
      <button
        type="button"
        className="admin-kebab__trigger"
        onClick={() => setOpen((v) => !v)}
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
          {showDelete && (
            <li role="menuitem">
              <button type="button" className="admin-kebab__item" disabled title="Скоро">
                Удалить
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
