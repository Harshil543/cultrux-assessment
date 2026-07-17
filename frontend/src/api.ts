const TOKEN_KEY = 'cultrux_token';

type ApiError = {
  success: false;
  error: { code: string; message: string; details?: unknown };
};

type ApiSuccess<T> = { success: true; data: T };

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(path, { ...options, headers });
  const json = (await res.json()) as ApiSuccess<T> | ApiError;

  if (!res.ok || !json.success) {
    const message =
      !json.success && 'error' in json ? json.error.message : 'Request failed';
    throw new Error(message);
  }

  return json.data;
}
