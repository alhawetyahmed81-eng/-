import { Capacitor } from '@capacitor/core';
import { auth } from './firebase';

const DEFAULT_NATIVE_API_BASE =
  'https://ais-pre-enm46hnncbrbf76qopdfjt-1012438960029.europe-west2.run.app';

export function getApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
    return DEFAULT_NATIVE_API_BASE;
  }
  return '';
}

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = getApiBaseUrl();
  if (!base) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function resolveUploadUrl(path?: string | null): string {
  if (!path) return '';
  if (path.startsWith('/uploads/')) return resolveApiUrl(path);
  return path;
}

export function resolveWebSocketUrl(token: string): string {
  const base = getApiBaseUrl();
  if (base) {
    const u = new URL(base);
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${u.host}/ws?token=${encodeURIComponent(token)}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const user = auth.currentUser;
  if (user) {
    const idToken = await user.getIdToken();
    headers.set('Authorization', `Bearer ${idToken}`);
  }

  const res = await fetch(resolveApiUrl(path), {
    ...options,
    headers,
  });

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { error: text };
  }

  if (!res.ok) {
    const err = new Error(parsed?.error || `Request failed (${res.status})`) as Error & {
      status?: number;
      payload?: any;
    };
    err.status = res.status;
    err.payload = parsed;
    throw err;
  }

  return parsed as T;
}

export async function uploadFileToServer(file: File): Promise<{ url: string; originalName: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  const uploaded = await apiFetch<{ url: string; originalName: string }>('/api/uploads', {
    method: 'POST',
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      dataBase64: dataUrl,
    }),
  });

  return {
    ...uploaded,
    url: resolveApiUrl(uploaded.url),
  };
}
