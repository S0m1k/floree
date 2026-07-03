import type { Metadata } from 'next';
import AdminNavLink from '@/components/admin/AdminNavLink';

export const metadata: Metadata = {
  title: 'Floree Admin',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <span className="admin-topbar__brand">Floree Admin</span>
        <nav className="admin-topbar__nav">
          <AdminNavLink href="/admin/retail-stores">Аналитика</AdminNavLink>
          <AdminNavLink href="/admin/orders">Заказы</AdminNavLink>
        </nav>
      </header>
      <div className="admin-body">{children}</div>
    </div>
  );
}
