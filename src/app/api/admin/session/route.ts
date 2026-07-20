import { NextRequest, NextResponse } from 'next/server';
import {
  accessCookie,
  refreshCookie,
  loginRequest,
  extractTokens,
} from '@/lib/adminSession';

// POST /api/admin/session — exchange login+password for a worker session and
// store the tokens in httpOnly cookies. Accepts JSON or form-encoded bodies.
export async function POST(request: NextRequest) {
  const { username, password } = await readCredentials(request);
  if (!username || !password) {
    return NextResponse.json({ error: 'Введите логин и пароль' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await loginRequest(username, password);
  } catch {
    return NextResponse.json({ error: 'Сервис недоступен. Попробуйте позже.' }, { status: 502 });
  }

  if (!upstream.ok) {
    const status = upstream.status === 401 ? 401 : 400;
    return NextResponse.json({ error: 'Неверный логин или пароль' }, { status });
  }

  const tokens = extractTokens(await upstream.json().catch(() => null));
  if (!tokens) {
    return NextResponse.json({ error: 'Некорректный ответ сервера' }, { status: 502 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(accessCookie(tokens.accessToken, tokens.expireAt));
  response.cookies.set(refreshCookie(tokens.refreshToken));
  return response;
}

async function readCredentials(
  request: NextRequest
): Promise<{ username?: string; password?: string }> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    return { username: body.username, password: body.password };
  }
  const form = await request.formData();
  return {
    username: String(form.get('username') || ''),
    password: String(form.get('password') || ''),
  };
}
