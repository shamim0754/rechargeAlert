// Local Quasar dev: always same-origin so Vite can proxy (avoids browser CORS / Failed to fetch).
// Capacitor / production: set QCLI_API_BASE to the Supabase functions URL.
const API_BASE = import.meta.env.DEV
  ? ''
  : (import.meta.env.QCLI_API_BASE as string | undefined) ||
    (import.meta.env.VITE_API_BASE as string | undefined) ||
    '';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem('ra_user_token', token);
  else localStorage.removeItem('ra_user_token');
}

export function getAuthToken() {
  return authToken || localStorage.getItem('ra_user_token');
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers: inputHeaders, body: inputBody, ...rest } = options;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(inputHeaders as Record<string, string> | undefined),
  };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = { ...rest, headers };
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (inputBody !== undefined) {
    init.body = inputBody;
  }

  const res = await fetch(`${API_BASE}${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { message?: string }).message || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}
