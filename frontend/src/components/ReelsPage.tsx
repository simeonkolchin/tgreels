import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFeed, hideVideo, setLike } from '../api';
import type { FeedItem } from '../types';
import ReelsFeed from './ReelsFeed';
import TopBar from './TopBar';

// Один и тот же экран рилсов:
//  • без `fixed` — бесконечная лента с сервера (главные рилсы);
//  • с `fixed`   — конечная подборка (видео канала / лайки из профиля),
//    отличается только тем, куда ведёт кнопка «назад».
interface Props {
  onGoHome: () => void;
  fixed?: { items: FeedItem[]; startIndex?: number; likedAll?: boolean };
  onOpenChannel?: (id: string, name?: string) => void;
}

export default function ReelsPage({ onGoHome, fixed, onOpenChannel }: Props) {
  const seedRef = useRef(Math.floor(Math.random() * 1_000_000_000));
  const [items, setItems] = useState<FeedItem[]>(fixed ? fixed.items : []);
  const [nextOffset, setNextOffset] = useState<number | null>(fixed ? null : 0);
  const [soundOn, setSoundOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!!fixed);
  const [feedKey, setFeedKey] = useState(0); // ремоунт ленты (сброс скролла) при обновлении
  const loadingRef = useRef(false);

  const likedIds = fixed?.likedAll ? new Set(items.map((i) => i.id)) : undefined;

  const loadMore = useCallback(async () => {
    if (fixed || loadingRef.current || nextOffset === null) return;
    loadingRef.current = true;
    try {
      const res = await fetchFeed(seedRef.current, nextOffset);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...res.items.filter((i) => !seen.has(i.id))];
      });
      setNextOffset(res.next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      loadingRef.current = false;
      setLoaded(true);
    }
  }, [nextOffset, fixed]);

  useEffect(() => {
    if (!fixed) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleHide = (id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    hideVideo(id);
  };

  // Обновить: в ленте — новый сид (перемешать всё сверху); в подборке — перетасовать локально.
  const refresh = async () => {
    if (fixed) {
      setItems((prev) => {
        const a = [...prev];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      });
      setFeedKey((k) => k + 1);
      return;
    }
    const newSeed = Math.floor(Math.random() * 1_000_000_000);
    seedRef.current = newSeed;
    setItems([]);
    setNextOffset(0);
    setLoaded(false);
    setError(null);
    setFeedKey((k) => k + 1);
    loadingRef.current = true;
    try {
      const res = await fetchFeed(newSeed, 0);
      setItems(res.items);
      setNextOffset(res.next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      loadingRef.current = false;
      setLoaded(true);
    }
  };

  return (
    <>
      <TopBar onBack={onGoHome} />
      {!loaded && items.length === 0 && (
        <div className="placeholder">
          <div className="spinner" />
          <p>Собираем ленту…</p>
        </div>
      )}
      {loaded && error && items.length === 0 && (
        <div className="placeholder">
          <p>😕 {error}</p>
          <button className="retry" onClick={loadMore}>
            Повторить
          </button>
        </div>
      )}
      {loaded && !error && items.length === 0 && (
        <div className="placeholder">
          <div className="empty-emoji">🎬</div>
          <p>Пока пусто</p>
          <span className="hint">
            Видео не найдено. Идёт индексация каналов, либо ты ни на что не подписан.
          </span>
          <button className="retry" onClick={loadMore}>
            Обновить
          </button>
        </div>
      )}
      {items.length > 0 && (
        <ReelsFeed
          key={feedKey}
          items={items}
          startIndex={fixed?.startIndex}
          soundOn={soundOn}
          onSetSound={setSoundOn}
          onHide={handleHide}
          onNearEnd={loadMore}
          likedIds={likedIds}
          onLike={setLike}
          onRefresh={refresh}
          onOpenChannel={onOpenChannel}
        />
      )}
    </>
  );
}
