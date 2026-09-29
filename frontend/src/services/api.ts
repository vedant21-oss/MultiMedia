import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ApiErrorBody, TokenPair } from '@/types';

const baseURL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const api = axios.create({ baseURL: `${baseURL}/api`, timeout: 300_000 });

const ACCESS = 'creatorai.access';
const REFRESH = 'creatorai.refresh';

export const tokens = {
  access: () => localStorage.getItem(ACCESS),
  refresh: () => localStorage.getItem(REFRESH),
  set(pair: TokenPair) {
    localStorage.setItem(ACCESS, pair.access_token);
    localStorage.setItem(REFRESH, pair.refresh_token);
  },
  clear() {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
  },
};

api.interceptors.request.use((config) => {
  const token = tokens.access();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Refresh-token rotation: a 401 triggers one refresh, and queued calls wait for it. */
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokens.refresh();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post<TokenPair>(`${baseURL}/api/auth/refresh`, {
      refresh_token: refreshToken,
    });
    tokens.set(data);
    return data.access_token;
  } catch {
    tokens.clear();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
    const isAuthCall = original?.url?.includes('/auth/');

    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      refreshing ??= refreshAccessToken().finally(() => {
        refreshing = null;
      });
      const fresh = await refreshing;
      if (fresh) {
        original.headers.Authorization = `Bearer ${fresh}`;
        return api(original);
      }
      if (window.location.pathname !== '/') {
        window.location.assign('/');
      }
    }
    return Promise.reject(error);
  },
);

/** Turns any failure into a message worth showing a person. */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  const axiosError = error as AxiosError<ApiErrorBody>;
  const body = axiosError?.response?.data;
  if (body?.fields) {
    const first = Object.values(body.fields)[0];
    if (first) return first;
  }
  if (body?.detail) return body.detail;
  if (axiosError?.code === 'ECONNABORTED') {
    return 'That took too long. Large media can be slow — try again.';
  }
  if (axiosError?.message === 'Network Error') {
    return 'Cannot reach the API. Is the backend running on port 8000?';
  }
  return (error as Error)?.message || fallback;
}

export function fieldErrors(error: unknown): Record<string, string> {
  return (error as AxiosError<ApiErrorBody>)?.response?.data?.fields ?? {};
}

/** Authenticated media URL — <img>/<video> cannot set headers, so the token rides the query. */
export function mediaUrl(assetId: string, kind: 'file' | 'thumbnail' = 'file'): string {
  return `${baseURL}/api/media/${assetId}/${kind}?token=${encodeURIComponent(tokens.access() ?? '')}`;
}

export function frameUrl(key: string): string {
  return `${baseURL}/api/video/frame?key=${encodeURIComponent(key)}&token=${encodeURIComponent(tokens.access() ?? '')}`;
}
