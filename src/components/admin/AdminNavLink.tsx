'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// `expanded` controls whether the text label renders next to the icon —
// used by AdminSidebar for the two top-level items that have no submenu
// (Аналитика, Заказы). When collapsed, only the icon shows (title attr
// gives a native tooltip instead).
export default function AdminNavLink({
  href, icon, label, expanded = false,
}: {
  href: string;
  icon: string;
  label: string;
  expanded?: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/admin' && pathname?.startsWith(href));
  return (
    <Link
      href={href}
      className={`admin-nav-link ${isActive ? 'admin-nav-link--active' : ''} ${expanded ? 'admin-nav-link--expanded' : ''}`}
      title={expanded ? undefined : label}
    >
      <span className="material-symbols-outlined admin-nav-link__icon">{icon}</span>
      {expanded && <span className="admin-nav-link__label">{label}</span>}
    </Link>
  );
}
