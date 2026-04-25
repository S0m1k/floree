const BASE_URL = process.env.POSIFLORA_BASE_URL!;
const USERNAME = process.env.POSIFLORA_USERNAME!;
const PASSWORD = process.env.POSIFLORA_PASSWORD!;

interface TokenCache {
  accessToken: string | null;
  expiresAt: number;
}

const cache: TokenCache = { accessToken: null, expiresAt: 0 };

async function getToken(): Promise<string> {
  if (cache.accessToken && Date.now() < cache.expiresAt) {
    return cache.accessToken;
  }
  const res = await fetch(`${BASE_URL}/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/vnd.api+json' },
    body: JSON.stringify({
      data: {
        type: 'sessions',
        attributes: { username: USERNAME, password: PASSWORD },
      },
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const json = await res.json();
  const token = json.data.attributes.accessToken;
  const expireAt = new Date(json.data.attributes.expireAt).getTime();
  cache.accessToken = token;
  cache.expiresAt = expireAt - 60_000; // 1min buffer
  return token;
}

export async function posifloraFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> | undefined),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Posiflora API error ${res.status}: ${text}`);
  }
  return res.json();
}
