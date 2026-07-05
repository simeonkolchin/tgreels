import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPhotos } from '../api';
import type { Page, PhotoPost } from '../types';
import { IconAccount, IconPersonPlus } from '../icons';
import BottomNav from './BottomNav';
import PostCard from './PostCard';
import Lightbox from './Lightbox';

export default function HomePage({ onNav }: { onNav: (p: Page) => void }) {
  const seedRef = useRef(Math.floor(Math.random() * 1_000_000_000));
  const [items, setItems] = useState<PhotoPost[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loaded, setLoaded] = useState(false);
  const [viewer, setViewer] = useState<{ photos: string[]; index: number } | null>(null);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || nextOffset === null) return;
    loadingRef.current = true;
    try {
      const res = await fetchPhotos(seedRef.current, nextOffset);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...res.items.filter((i) => !seen.has(i.id))];
      });
      setNextOffset(res.next);
    } catch {
      /* игнор, попробуем ещё при скролле */
    } finally {
      loadingRef.current = false;
      setLoaded(true);
    }
  }, [nextOffset]);

  useEffect(() => {
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // бесконечная прокрутка через сентинел внизу
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '600px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  return (
    <div className="page">
      <header className="x-topbar">
        <button className="x-topbar-btn" aria-label="аккаунт">
          <IconAccount />
        </button>
        <div className="r-logo">R</div>
        <button className="x-topbar-btn" aria-label="добавить">
          <IconPersonPlus />
        </button>
      </header>

      <div className="feed">
        {items.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onOpenPhoto={(photos, index) => setViewer({ photos, index })}
          />
        ))}

        {loaded && items.length === 0 && (
          <div className="placeholder static">
            <div className="empty-emoji">🖼️</div>
            <p>Пока пусто</p>
            <span className="hint">Постов с фото не найдено. Идёт индексация каналов.</span>
          </div>
        )}

        <div ref={sentinelRef} className="feed-sentinel">
          {nextOffset !== null && items.length > 0 && <div className="spinner small" />}
        </div>
      </div>

      <BottomNav active="home" onNav={onNav} />

      {viewer && (
        <Lightbox
          photos={viewer.photos}
          start={viewer.index}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
