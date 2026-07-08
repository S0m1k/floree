import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_ACCESS_COOKIE } from './adminSession';

// Same base-URL resolution the admin data-fetch modules already use: internal
// URL first (server-to-server inside the deploy), then the public URL, then a
// local default.
export const ADMIN_API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Server-side fetch to a protected /api/v1 endpoint. Reads the worker's access
 * token from the httpOnly cookie and sends it as a Bearer token. A 401 means
 * the session is gone (middleware refresh already failed), so we bounce to the
 * login page rather than rendering a broken admin screen.
 */
export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = cookies().get(ADMIN_ACCESS_COOKIE)?.value;
  const res = await fetch(`${ADMIN_API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401) {
    redirect('/admin/login');
  }
  return res;
}
