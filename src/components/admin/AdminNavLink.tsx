'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminNavLink({
  href, icon, label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/admin' && pathname?.startsWith(href));
  return (
    <Link href={href} className={`admin-nav-link ${isActive ? 'admin-nav-link--active' : ''}`} title={label}>
      <span className="material-symbols-outlined admin-nav-link__icon">{icon}</span>
    </Link>
  );
}
