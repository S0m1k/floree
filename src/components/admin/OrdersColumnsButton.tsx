'use client';

import { useEffect, useRef, useState } from 'react';

export interface ColumnDef {
  key: string;
  label: string;
  // Locked columns (№, действия) are always visible and absent from the menu.
  locked?: boolean;
  defaultOn: boolean;
}

interface Props {
  columns: ColumnDef[];
  visible: Record<string, boolean>;
  onToggle: (key: string) => void;
  onReset: () => void;
}

// Кнопка «Столбцы» над таблицей заказов (admin-map §2.2: настройка видимых
// колонок — общий паттерн документных списков Posiflora, §4 «единый паттерн»).
export default function OrdersColumnsButton({ columns, visible, onToggle, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="admin-row-menu" ref={rootRef}>
      <button
        type="button"
        className="admin-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Столбцы
      </button>

      {open && (
        <ul className="admin-row-menu__list admin-columns-menu" role="menu">
          {columns.filter((c) => !c.locked).map((c) => (
            <li key={c.key} role="menuitemcheckbox" aria-checked={!!visible[c.key]}>
              <label className="admin-row-menu__item admin-columns-menu__item">
                <input
                  type="checkbox"
                  checked={!!visible[c.key]}
                  onChange={() => onToggle(c.key)}
                />
                {c.label}
              </label>
            </li>
          ))}
          <li role="menuitem" style={{ borderTop: '1px solid var(--admin-border)', marginTop: 4, paddingTop: 4 }}>
            <button type="button" className="admin-row-menu__item" onClick={onReset}>
              Сбросить по умолчанию
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
