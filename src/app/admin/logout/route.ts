import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  logoutRequest,
} from '@/lib/adminSession';

// GET /admin/logout — the sidebar "Выйти" link. Revokes the refresh token on
// the backend (best-effort), clears both auth cookies and returns to login.
export async function GET(request: NextRequest) {
  const refreshToken = request.cookies.get(ADMIN_REFRESH_COOKIE)?.value;
  if (refreshToken) {
    try {
      await logoutRequest(refreshToken);
    } catch {
      // Logout must always succeed locally even if the backend is unreachable.
    }
  }

  const response = NextResponse.redirect(new URL('/admin/login', request.url));
  response.cookies.delete(ADMIN_ACCESS_COOKIE);
  response.cookies.delete(ADMIN_REFRESH_COOKIE);
  return response;
}
