import type { FeedItem, FeedResponse, PhotoResponse } from './types';

const PAGE_SIZE = 8;
const PHOTO_PAGE_SIZE = 6;

export async function fetchFeed(seed: number, offset: number): Promise<FeedResponse> {
  const params = new URLSearchParams({
    seed: String(seed),
    offset: String(offset),
    limit: String(PAGE_SIZE),
  });
  const res = await fetch(`/api/feed?${params}`);
  if (!res.ok) throw new Error(`feed failed: ${res.status}`);
  return res.json();
}

export async function fetchPhotos(seed: number, offset: number): Promise<PhotoResponse> {
  const params = new URLSearchParams({
    seed: String(seed),
    offset: String(offset),
    limit: String(PHOTO_PAGE_SIZE),
  });
  const res = await fetch(`/api/photos?${params}`);
  if (!res.ok) throw new Error(`photos failed: ${res.status}`);
  return res.json();
}

// «Обновить ленту» — запустить реиндекс на сервере (докачать новое из Telegram).
export async function reindexFeed(): Promise<{ added: number; videos: number; photos: number }> {
  const res = await fetch('/api/reindex', { method: 'POST' });
  if (!res.ok) throw new Error(`reindex failed: ${res.status}`);
  return res.json();
}

// ── Авторизация ──────────────────────────────────────────
export interface AuthResult {
  ok: boolean;
  step?: 'code' | 'password' | 'account' | 'login-code' | 'done';
  error?: string;
  username?: string | null;
}

export async function authStatus(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    return !!data.authorized;
  } catch {
    return false;
  }
}

async function authPost(path: string, body: unknown): Promise<AuthResult> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `Ошибка сервера (${res.status})` };
    return res.json();
  } catch {
    return { ok: false, error: 'Сеть недоступна' };
  }
}

export interface Me {
  name: string;
  username: string | null;
  photos: number;
}

export async function fetchMe(): Promise<Me> {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) return { name: '', username: null, photos: 0 };
    return res.json();
  } catch {
    return { name: '', username: null, photos: 0 };
  }
}

export interface Gallery {
  channel: boolean;
  photos: number[];
}

export async function fetchGallery(): Promise<Gallery> {
  try {
    const res = await fetch('/api/me/gallery');
    if (!res.ok) return { channel: false, photos: [] };
    return res.json();
  } catch {
    return { channel: false, photos: [] };
  }
}

export interface Stats {
  posts: number | null;
  followers: number | null;
  likes: number | null;
  channels: number | null;
  chats: number | null;
  saved: number | null;
  computing: boolean;
}

// Статистика канала (подписчики/посты/реакции/каналы/чаты/возраст). Считается
// на сервере, кэшируется в БД; каждая цифра появляется по мере готовности.
export async function fetchStats(refresh = false): Promise<Stats> {
  const empty: Stats = {
    posts: null,
    followers: null,
    likes: null,
    channels: null,
    chats: null,
    saved: null,
    computing: false,
  };
  try {
    const res = await fetch(`/api/me/stats${refresh ? '?refresh=1' : ''}`);
    if (!res.ok) return empty;
    return res.json();
  } catch {
    return empty;
  }
}

// Видео личного канала (для раздела «Видео» в профиле)
export async function fetchMyVideos(): Promise<{ channel: boolean; items: FeedItem[] }> {
  try {
    const res = await fetch('/api/me/videos');
    if (!res.ok) return { channel: false, items: [] };
    return res.json();
  } catch {
    return { channel: false, items: [] };
  }
}

// Понравившиеся видео (для раздела «Лайки» в профиле)
export async function fetchLikes(): Promise<FeedItem[]> {
  try {
    const res = await fetch('/api/me/likes');
    if (!res.ok) return [];
    return (await res.json()).items ?? [];
  } catch {
    return [];
  }
}

// Поставить/снять лайк — сохраняем на сервере (попадает в раздел «Лайки»).
export async function setLike(id: number, liked: boolean): Promise<void> {
  try {
    await fetch(`/api/like/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ liked }),
    });
  } catch {
    /* не критично */
  }
}

export const authStart = (api_id: number, api_hash: string, phone: string) =>
  authPost('/api/auth/start', { api_id, api_hash, phone });
export const authCode = (code: string) => authPost('/api/auth/code', { code });
export const authPassword = (password: string) => authPost('/api/auth/password', { password });
export const authRegister = (username: string, password: string) =>
  authPost('/api/auth/register', { username, password });
export const authLogin = (username: string, password: string) =>
  authPost('/api/auth/login', { username, password });
export const authLoginCode = (code: string) => authPost('/api/auth/login-code', { code });

export async function checkUsername(u: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/auth/username-available?u=${encodeURIComponent(u)}`);
    if (!res.ok) return false;
    return !!(await res.json()).available;
  } catch {
    return false;
  }
}

// «Не интересует» — пометить видео скрытым на сервере (больше не покажем).
export async function hideVideo(id: number): Promise<void> {
  try {
    await fetch(`/api/hide/${id}`, { method: 'POST' });
  } catch {
    /* если не дошло — не страшно, локально всё равно скрыли */
  }
}
