/**
 * Admin session core — cookie names/options and the backend /v1/sessions calls.
 *
 * This module is intentionally free of `next/headers` and `next/navigation` so
 * it can be imported from both middleware (edge runtime) and Route Handlers.
 */

export const ADMIN_ACCESS_COOKIE = 'admin_access_token';
export const ADMIN_REFRESH_COOKIE = 'admin_refresh_token';

const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, matches backend refresh TTL
const ACCESS_FALLBACK_MAX_AGE = 60 * 60; // 1 hour, matches backend access TTL

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expireAt?: string;
}

export interface SessionCookie {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
}

function baseCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
}

function secondsUntil(iso: string | undefined, fallback: number): number {
  if (!iso) return fallback;
  const seconds = Math.floor((new Date(iso).getTime() - Date.now()) / 1000);
  return Number.isFinite(seconds) && seconds > 60 ? seconds : fallback;
}

export function accessCookie(value: string, expireAt?: string): SessionCookie {
  return {
    name: ADMIN_ACCESS_COOKIE,
    value,
    ...baseCookieOptions(),
    maxAge: secondsUntil(expireAt, ACCESS_FALLBACK_MAX_AGE),
  };
}

export function refreshCookie(value: string): SessionCookie {
  return {
    name: ADMIN_REFRESH_COOKIE,
    value,
    ...baseCookieOptions(),
    maxAge: REFRESH_MAX_AGE,
  };
}

function postSession(attributes: Record<string, string>): Promise<Response> {
  return fetch(`${API_URL}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { type: 'sessions', attributes } }),
    cache: 'no-store',
  });
}

export function loginRequest(username: string, password: string): Promise<Response> {
  return postSession({ username, password });
}

export function refreshRequest(refreshToken: string): Promise<Response> {
  return postSession({ refreshToken });
}

export function logoutRequest(refreshToken: string): Promise<Response> {
  return fetch(`${API_URL}/api/v1/sessions`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { type: 'sessions', attributes: { refreshToken } } }),
    cache: 'no-store',
  });
}

// Reads accessToken/refreshToken from a JSON:API session document, or null.
export function extractTokens(json: unknown): SessionTokens | null {
  const attrs = (json as { data?: { attributes?: Record<string, unknown> } })?.data?.attributes;
  const accessToken = attrs?.accessToken;
  const refreshToken = attrs?.refreshToken;
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') return null;
  return {
    accessToken,
    refreshToken,
    expireAt: typeof attrs?.expireAt === 'string' ? attrs.expireAt : undefined,
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof atob === 'function'
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// True when the access token is missing an `exp` or is already past it. The
// signature is NOT verified here — the backend does that on every request; the
// middleware only needs to know whether to attempt a refresh.
export function accessTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp !== 'number') return true;
  return Date.now() >= exp * 1000;
}
