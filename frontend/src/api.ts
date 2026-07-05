import type { FeedResponse, PhotoResponse } from './types';

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

// «Не интересует» — пометить видео скрытым на сервере (больше не покажем).
export async function hideVideo(id: number): Promise<void> {
  try {
    await fetch(`/api/hide/${id}`, { method: 'POST' });
  } catch {
    /* если не дошло — не страшно, локально всё равно скрыли */
  }
}
