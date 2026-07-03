import type { Metadata } from 'next';
import Link from 'next/link';

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
          <Link href="/admin/orders" className="admin-topbar__link admin-topbar__link--active">
            Заказы
          </Link>
        </nav>
      </header>
      <div className="admin-body">{children}</div>
    </div>
  );
}
