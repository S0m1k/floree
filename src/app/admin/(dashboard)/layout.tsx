import Link from 'next/link';
import AdminNavLink from '@/components/admin/AdminNavLink';

// Icon/label map for the 8 Posiflora admin menu groups (docs/posiflora/admin-map.md).
// Icons are Material Symbols ligature names — matches the real admin's icon font
// (verified against the live floreii.posiflora.com sidebar); the two groups that
// use a custom SVG sprite there (Букеты и каталог, Клиенты и развитие) get the
// closest Material Symbols equivalent instead of copying Posiflora's own asset.
const NAV_ITEMS = [
  { href: '/admin/retail-stores', icon: 'home', label: 'Аналитика' },
  { href: '/admin/orders', icon: 'event', label: 'Заказы' },
  { href: '/admin/specifications', icon: 'local_florist', label: 'Букеты и каталог' },
  { href: '/admin/finance', icon: 'currency_exchange', label: 'Учёт и финансы' },
  { href: '/admin/customers', icon: 'group', label: 'Клиенты и развитие' },
  { href: '/admin/staff', icon: 'manage_accounts', label: 'Контроль сотрудников' },
  { href: '/admin/settings', icon: 'settings', label: 'Настройки' },
];

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell">
      <nav className="admin-sidebar">
        <Link href="/admin/retail-stores" className="admin-sidebar__logo">F</Link>
        {NAV_ITEMS.map((item) => (
          <AdminNavLink key={item.href} href={item.href} icon={item.icon} label={item.label} />
        ))}
        {/* Logout is a GET route handler; use a plain anchor (not <Link>) so it
            is never prefetched — a prefetch would silently log the user out. */}
        <a href="/admin/logout" className="admin-nav-link admin-nav-link--logout" title="Выйти">
          <span className="material-symbols-outlined admin-nav-link__icon">logout</span>
        </a>
      </nav>
      <div className="admin-main">
        <header className="admin-topbar" />
        <div className="admin-body">{children}</div>
      </div>
    </div>
  );
}
