import Link from 'next/link';

// Horizontal sub-navigation across the «Контроль сотрудников» screens
// (docs/posiflora/admin-map.md §2.6) — same tab-strip pattern as WarehouseNav.
const ITEMS: { href: string; label: string }[] = [
  { href: '/admin/shifts', label: 'Рабочие смены' },
  { href: '/admin/staff', label: 'Сотрудники' },
  { href: '/admin/roles', label: 'Настройки доступов' },
  { href: '/admin/staff-devices', label: 'Устройства флористов' },
];

export default function StaffNav({ active }: { active: string }) {
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
