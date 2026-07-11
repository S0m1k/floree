import Link from 'next/link';

// Horizontal sub-navigation across the «Настройки» dictionary screens
// (docs/posiflora/admin-map.md §2.7) — same tab-strip pattern as StaffNav.
// Order matches the §2.7 table.
const ITEMS: { href: string; label: string }[] = [
  { href: '/admin/order-tags', label: 'Теги заказов' },
  { href: '/admin/recipe-tags', label: 'Теги букетов' },
  { href: '/admin/discount-reasons', label: 'Причины скидок и надбавок' },
  { href: '/admin/customer-celebrations', label: 'Праздничные события' },
  { href: '/admin/customer-preferences', label: 'Предпочтения клиентов' },
  { href: '/admin/customer-sources', label: 'Откуда узнали о нас' },
  { href: '/admin/cash-reasons', label: 'Причины изъятий и внесений' },
  { href: '/admin/customer-deal-sources', label: 'Источники сделок' },
  { href: '/admin/units-of-measure', label: 'Единицы измерения' },
  { href: '/admin/personal-data', label: 'Форма заполнения политики' },
];

export default function SettingsNav({ active }: { active: string }) {
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
