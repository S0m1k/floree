import Link from 'next/link';

// Horizontal sub-navigation across the «Клиенты и развитие» screens
// (docs/posiflora/admin-map.md §2.5) — same tab-strip pattern as StaffNav/
// SettingsNav. Covers the list + the three «Система лояльности» screens.
const ITEMS: { href: string; label: string }[] = [
  { href: '/admin/customers', label: 'Список клиентов' },
  { href: '/admin/customers/import', label: 'Импорт клиентов' },
  { href: '/admin/bonuses', label: 'Бонусы' },
  { href: '/admin/discounts', label: 'Скидки' },
  { href: '/admin/bonus-cards', label: 'Бонусные карты' },
];

export default function CustomersNav({ active }: { active: string }) {
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
