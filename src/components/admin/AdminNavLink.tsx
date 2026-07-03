'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/admin' && pathname?.startsWith(href));
  return (
    <Link href={href} className={`admin-topbar__link ${isActive ? 'admin-topbar__link--active' : ''}`}>
      {children}
    </Link>
  );
}
