import Link from 'next/link';

// Horizontal sub-navigation across the "Учёт и финансы" screens + catalog
// (grouped together per the build brief, even though admin-map.md files
// "Каталог" under «Букеты и каталог» — this tab strip is our own addition,
// not a 1:1 copy of a specific Posiflora screen).
const ITEMS: { href: string; label: string }[] = [
  { href: '/admin/warehouse', label: 'Обзор склада' },
  { href: '/admin/catalog', label: 'Каталог' },
  { href: '/admin/packing-invoices', label: 'Приходные' },
  { href: '/admin/writeoff-invoices', label: 'Списания' },
  { href: '/admin/markdown-acts', label: 'Уценка' },
  { href: '/admin/sorting-acts', label: 'Пересорт' },
  { href: '/admin/inventory-acts', label: 'Инвентаризации' },
  { href: '/admin/movement-acts', label: 'Перемещения' },
  { href: '/admin/vendors', label: 'Поставщики' },
  { href: '/admin/reports', label: 'Отчёты' },
  { href: '/admin/financial-accounting', label: 'Финансовый учёт' },
  { href: '/admin/exports-list', label: 'Экспорт таблиц' },
];

export default function WarehouseNav({ active }: { active: string }) {
  return (
    <nav className="admin-subtabs admin-subtabs--wrap">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`admin-subtab ${active === item.href ? 'admin-subtab--active' : ''}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
