import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  accessCookie,
  refreshCookie,
  refreshRequest,
  extractTokens,
  accessTokenExpired,
} from '@/lib/adminSession';

const LOGIN_PATH = '/admin/login';
// Reachable without a valid session: the login page and the logout handler
// (logout must be able to clear cookies even if the session already expired).
const PUBLIC_ADMIN_PATHS = new Set([LOGIN_PATH, '/admin/logout']);

export async function middleware(request: NextRequest) {
  if (PUBLIC_ADMIN_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const access = request.cookies.get(ADMIN_ACCESS_COOKIE)?.value;
  if (access && !accessTokenExpired(access)) {
    return NextResponse.next();
  }

  const refresh = request.cookies.get(ADMIN_REFRESH_COOKIE)?.value;
  if (refresh) {
    const rotated = await tryRefresh(request, refresh);
    if (rotated) return rotated;
  }

  return redirectToLogin(request);
}

// Rotate the refresh token via the backend. On success, forward the new access
// token to the downstream server components (via request cookies) and persist
// both rotated tokens in the browser (via response cookies).
async function tryRefresh(
  request: NextRequest,
  refresh: string
): Promise<NextResponse | null> {
  try {
    const res = await refreshRequest(refresh);
    if (!res.ok) return null;
    const tokens = extractTokens(await res.json().catch(() => null));
    if (!tokens) return null;

    request.cookies.set(ADMIN_ACCESS_COOKIE, tokens.accessToken);
    request.cookies.set(ADMIN_REFRESH_COOKIE, tokens.refreshToken);
    const response = NextResponse.next({ request });
    response.cookies.set(accessCookie(tokens.accessToken, tokens.expireAt));
    response.cookies.set(refreshCookie(tokens.refreshToken));
    return response;
  } catch {
    return null;
  }
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  url.search = '';
  const response = NextResponse.redirect(url);
  response.cookies.delete(ADMIN_ACCESS_COOKIE);
  response.cookies.delete(ADMIN_REFRESH_COOKIE);
  return response;
}

export const config = {
  matcher: ['/admin/:path*'],
};
