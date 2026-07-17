type ApiError = {
  success: false;
  error: { code: string; message: string; details?: unknown };
};

type ApiSuccess<T> = { success: true; data: T };

/**
 * Cookie-based auth: browser sends HTTP-only cookie automatically.
 * credentials: 'include' is required for cross-origin / credentialed requests.
 */
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  const json = (await res.json()) as ApiSuccess<T> | ApiError;

  if (!res.ok || !json.success) {
    const message =
      !json.success && 'error' in json ? json.error.message : 'Request failed';
    throw new Error(message);
  }

  return json.data;
}
