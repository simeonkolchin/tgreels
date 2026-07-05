import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFeed, hideVideo } from '../api';
import type { FeedItem } from '../types';
import ReelsFeed from './ReelsFeed';
import TopBar from './TopBar';

// Страница рилсов (как была в App). Стрелка сверху ведёт на главную.
export default function ReelsPage({ onGoHome }: { onGoHome: () => void }) {
  const seedRef = useRef(Math.floor(Math.random() * 1_000_000_000));
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [soundOn, setSoundOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [feedKey, setFeedKey] = useState(0); // ремоунт ленты (сброс скролла) при обновлении
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || nextOffset === null) return;
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
  }, [nextOffset]);

  useEffect(() => {
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleHide = (id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    hideVideo(id);
  };

  // Обновить ленту: новый сид → перемешать всё и начать сверху.
  const refresh = async () => {
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
      <TopBar onBack={onGoHome} onRefresh={refresh} />
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
          soundOn={soundOn}
          onSetSound={setSoundOn}
          onHide={handleHide}
          onNearEnd={loadMore}
        />
      )}
    </>
  );
}
