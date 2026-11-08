import fetch, { Response } from 'node-fetch';
import { CookieJar } from 'tough-cookie';

const BASE = () => (process.env.DESCO_BASE_URL || 'https://prepaid.desco.org.bd/api').replace(/\/$/, '');

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

function decodeXsrf(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = /(?:^|;\s*)XSRF-TOKEN=([^;]+)/.exec(cookieHeader);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export class DescoClient {
  jar: CookieJar;

  constructor(jar?: CookieJar) {
    this.jar = jar || new CookieJar();
  }

  private async cookieHeader(url: string): Promise<string> {
    return (await this.jar.getCookieString(url)) || '';
  }

  private async storeCookies(url: string, res: Response): Promise<void> {
    const raw = res.headers.raw()['set-cookie'];
    if (!raw) return;
    for (const c of raw) {
      await this.jar.setCookie(c, url);
    }
  }

  async request<T = unknown>(
    path: string,
    options: { method?: string; body?: unknown; query?: Record<string, string> } = {},
  ): Promise<T> {
    const method = options.method || 'GET';
    const url = new URL(`${BASE()}${path.startsWith('/') ? path : `/${path}`}`);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'RechargeAlert/1.0',
    };

    const cookie = await this.cookieHeader(url.toString());
    if (cookie) headers.Cookie = cookie;

    if (method !== 'GET' && method !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
      const xsrf = decodeXsrf(cookie);
      if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;
    }

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    await this.storeCookies(url.toString(), res);

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
    return this.request('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
  }

  async session(): Promise<unknown> {
    return this.request('/auth/session');
  }

  async registerStart(username: string, otpMobile?: string): Promise<unknown> {
    await this.csrf();
    const body = otpMobile ? { username, otpMobile } : { username };
    return this.request('/auth/register/start', { method: 'POST', body });
  }

  async registerVerify(username: string, code: string): Promise<unknown> {
    return this.request('/auth/register/verify', {
      method: 'POST',
      body: { username, code },
    });
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
