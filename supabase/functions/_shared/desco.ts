const BASE = () =>
  (Deno.env.get('DESCO_BASE_URL') || 'https://prepaid.desco.org.bd/api').replace(/\/$/, '');

export class DescoError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'DescoError';
    this.status = status;
    this.body = body;
  }
}

export type DescoAccount = {
  accountId: number;
  sourceSystem?: string;
  accountNo?: string;
  meterNo?: string;
  status?: string;
  linkStatus?: string;
};

export type DescoBalance = {
  accountNo?: string;
  meterNo?: string;
  balance?: number | null;
  meterType?: string;
  currency?: string;
  balanceSnapshotAt?: string;
  timestampSource?: string;
  timestampAvailable?: boolean;
  stale?: boolean;
  currentMonthConsumedTaka?: number;
  readingTime?: string;
  consumerMessages?: unknown;
};

type StoredCookie = { name: string; value: string; domain?: string; path?: string };

export class CookieJar {
  cookies: StoredCookie[] = [];

  static fromJson(raw: string | null | undefined): CookieJar {
    const jar = new CookieJar();
    if (!raw) return jar;
    try {
      const parsed = JSON.parse(raw) as StoredCookie[];
      if (Array.isArray(parsed)) jar.cookies = parsed;
    } catch {
      /* ignore */
    }
    return jar;
  }

  toJson(): string {
    return JSON.stringify(this.cookies);
  }

  header(): string {
    return this.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  }

  setFromResponse(res: Response) {
    // Deno/Edge may expose getSetCookie()
    const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
    const list =
      typeof anyHeaders.getSetCookie === 'function'
        ? anyHeaders.getSetCookie()
        : (() => {
            const single = res.headers.get('set-cookie');
            return single ? [single] : [];
          })();

    for (const line of list) {
      const part = line.split(';')[0];
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      const idx = this.cookies.findIndex((c) => c.name === name);
      if (idx >= 0) this.cookies[idx] = { name, value };
      else this.cookies.push({ name, value });
    }
  }

  xsrf(): string | null {
    const c = this.cookies.find((x) => x.name === 'XSRF-TOKEN');
    if (!c) return null;
    try {
      return decodeURIComponent(c.value);
    } catch {
      return c.value;
    }
  }
}

export class DescoClient {
  jar: CookieJar;

  constructor(jar?: CookieJar) {
    this.jar = jar || new CookieJar();
  }

  async request<T = unknown>(
    path: string,
    options: { method?: string; body?: unknown; query?: Record<string, string> } = {},
  ): Promise<T> {
    const method = options.method || 'GET';
    const url = new URL(`${BASE()}${path.startsWith('/') ? path : `/${path}`}`);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) url.searchParams.set(k, v);
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'RechargeAlert/1.0',
    };
    const cookie = this.jar.header();
    if (cookie) headers.Cookie = cookie;

    if (method !== 'GET' && method !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
      const xsrf = this.jar.xsrf();
      if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;
    }

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    this.jar.setFromResponse(res);

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      const msg =
        typeof data === 'object' && data && 'message' in data
          ? String((data as { message: string }).message)
          : `DESCO request failed (${res.status})`;
      throw new DescoError(msg, res.status, data);
    }
    return data as T;
  }

  async csrf(): Promise<void> {
    await this.request('/auth/csrf');
  }

  async login(username: string, password: string): Promise<unknown> {
    await this.csrf();
    return this.request('/auth/login', { method: 'POST', body: { username, password } });
  }

  async registerStart(username: string, otpMobile?: string): Promise<unknown> {
    await this.csrf();
    const body = otpMobile ? { username, otpMobile } : { username };
    return this.request('/auth/register/start', { method: 'POST', body });
  }

  async registerVerify(username: string, code: string): Promise<unknown> {
    return this.request('/auth/register/verify', { method: 'POST', body: { username, code } });
  }

  async registerSetPassword(username: string, password: string): Promise<unknown> {
    return this.request('/auth/register/set-password', {
      method: 'POST',
      body: { username, password },
    });
  }

  async listAccounts(): Promise<DescoAccount[]> {
    const data = await this.request<{ accounts?: DescoAccount[] }>('/accounts');
    return data?.accounts || [];
  }

  async getBalance(accountId: number): Promise<DescoBalance> {
    return this.request<DescoBalance>(`/accounts/${accountId}/balance`);
  }
}
