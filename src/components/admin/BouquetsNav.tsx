import Link from 'next/link';

// Horizontal sub-navigation across the «Букеты и каталог» screens
// (docs/posiflora/admin-map.md §2.3) — same tab-strip pattern as WarehouseNav/
// StaffNav. Items with no `href` aren't implemented yet (paid storefront
// feature / dashboard-only analytics / vendor catalog import) and render as
// an inert, disabled tab instead of a link.
const ITEMS: { href?: string; label: string }[] = [
  { href: '/admin/showcase', label: 'Букеты в магазине' },
  { href: '/admin/shop-settings', label: 'Онлайн-витрина' },
  { label: 'Аналитика' },
  { href: '/admin/catalog', label: 'Каталог товаров и услуг' },
  { href: '/admin/categories', label: 'Категории' },
  { href: '/admin/specifications', label: 'Рецепты' },
  { label: 'Импорт' },
];

export default function BouquetsNav({ active }: { active: string }) {
  return (
    <nav className="admin-subtabs admin-subtabs--wrap">
      {ITEMS.map((item) =>
        item.href ? (
          <Link
            key={item.label}
            href={item.href}
            className={`admin-subtab ${active === item.href ? 'admin-subtab--active' : ''}`}
          >
            {item.label}
          </Link>
        ) : (
          <span key={item.label} className="admin-subtab admin-subtab--disabled" title="Пока недоступно">
            {item.label}
          </span>
        )
      )}
    </nav>
  );
}
