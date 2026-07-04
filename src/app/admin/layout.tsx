import type { Metadata } from 'next';
import Link from 'next/link';
import AdminNavLink from '@/components/admin/AdminNavLink';

export const metadata: Metadata = {
  title: 'Floree Admin',
  robots: { index: false, follow: false },
};

// Icon/label map for the 8 Posiflora admin menu groups (docs/posiflora/admin-map.md).
// Icons are Material Symbols ligature names — matches the real admin's icon font
// (verified against the live floreii.posiflora.com sidebar); the two groups that
// use a custom SVG sprite there (Букеты и каталог, Клиенты и развитие) get the
// closest Material Symbols equivalent instead of copying Posiflora's own asset.
const NAV_ITEMS = [
  { href: '/admin/retail-stores', icon: 'home', label: 'Аналитика' },
  { href: '/admin/orders', icon: 'event', label: 'Заказы' },
  { href: '/admin/catalog', icon: 'local_florist', label: 'Букеты и каталог' },
  { href: '/admin/finance', icon: 'currency_exchange', label: 'Учёт и финансы' },
  { href: '/admin/customers', icon: 'group', label: 'Клиенты и развитие' },
  { href: '/admin/staff', icon: 'manage_accounts', label: 'Контроль сотрудников' },
  { href: '/admin/settings', icon: 'settings', label: 'Настройки' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell">
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- admin-only icon font, loaded once for the whole section */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0&family=Roboto:wght@400;500;700&display=swap"
      />
      <nav className="admin-sidebar">
        <Link href="/admin/retail-stores" className="admin-sidebar__logo">F</Link>
        {NAV_ITEMS.map((item) => (
          <AdminNavLink key={item.href} href={item.href} icon={item.icon} label={item.label} />
        ))}
      </nav>
      <div className="admin-main">
        <header className="admin-topbar" />
        <div className="admin-body">{children}</div>
      </div>
    </div>
  );
}
