import { useEffect, useRef, useState } from 'react';
import type { FeedItem } from '../types';
import ReelItem from './ReelItem';

interface Props {
  items: FeedItem[];
  soundOn: boolean;
  onSetSound: (value: boolean) => void;
  onHide: (id: number) => void;
  onNearEnd: () => void;
  likedIds?: Set<number>;
  onLike?: (id: number, liked: boolean) => void;
  startIndex?: number;
  onRefresh?: () => void;
  onOpenChannel?: (id: string, name?: string) => void;
  paused?: boolean;
}

const PULL_ZONE = 0.24; // верхняя доля экрана, откуда работает «потянуть вниз»
const PULL_TRIGGER = 84; // порог срабатывания обновления, px

export default function ReelsFeed({
  items,
  soundOn,
  onSetSound,
  onHide,
  onNearEnd,
  likedIds,
  onLike,
  startIndex = 0,
  onRefresh,
  onOpenChannel,
  paused,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const [pull, setPull] = useState(0); // текущая величина оттягивания (px, с сопротивлением)
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0); // актуальное значение pull для обработчика touchend
  pullRef.current = pull;
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  // Фикс мобильного автоплея: браузер после пары свайпов запускает ролик БЕЗ звука
  // (autoplay-with-sound без жеста блокируется → mute-фолбэк). На касании/свайпе
  // (это жест) возвращаем звук играющему видео, если звук включён.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const restore = () => {
      if (!soundOnRef.current) return;
      root.querySelectorAll<HTMLVideoElement>('video').forEach((v) => {
        if (!v.paused && v.muted) v.muted = false;
      });
    };
    root.addEventListener('touchstart', restore, { passive: true });
    root.addEventListener('touchmove', restore, { passive: true });
    root.addEventListener('touchend', restore, { passive: true });
    return () => {
      root.removeEventListener('touchstart', restore);
      root.removeEventListener('touchmove', restore);
      root.removeEventListener('touchend', restore);
    };
  }, []);

  // Открытие с конкретного ролика (тап по превью) — мгновенный скролл.
  useEffect(() => {
    if (startIndex <= 0) return;
    const el = containerRef.current;
    el?.querySelector<HTMLElement>(`.reel[data-index="${startIndex}"]`)?.scrollIntoView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Активный ролик: тот, что заполняет вьюпорт больше чем на 60%.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            setActiveIndex(Number((entry.target as HTMLElement).dataset.index));
          }
        }
      },
      { root, threshold: [0.6] }
    );
    root.querySelectorAll('.reel').forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [items.length]);

  useEffect(() => {
    if (activeIndex >= items.length - 3) onNearEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, items.length]);

  // Pull-to-refresh: тянем вниз из ВЕРХНЕЙ зоны экрана → крутящийся кружок → обновление.
  // В нижней части экрана — обычное листание (не перехватываем).
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !onRefresh) return;
    let startY = 0;
    let active = false; // жест начался в верхней зоне и тянем вниз

    const onStart = (e: TouchEvent) => {
      if (refreshing) return;
      const t = e.touches[0];
      startY = t.clientY;
      active = t.clientY < window.innerHeight * PULL_ZONE;
    };
    const onMove = (e: TouchEvent) => {
      if (!active || refreshing) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) {
        // тянут вверх (следующий ролик) — не мешаем
        active = false;
        setPull(0);
        return;
      }
      e.preventDefault(); // блокируем прокрутку, показываем оттягивание
      setPull(Math.min(160, dy * 0.5)); // сопротивление
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      if (pullRef.current >= PULL_TRIGGER) {
        setRefreshing(true);
        setPull(PULL_TRIGGER);
        onRefresh(); // ремоунт ленты по feedKey сбросит это состояние
      } else {
        setPull(0);
      }
    };
    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', onEnd, { passive: true });
    root.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchmove', onMove);
      root.removeEventListener('touchend', onEnd);
      root.removeEventListener('touchcancel', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRefresh, refreshing]);

  const goTo = (idx: number) => {
    containerRef.current
      ?.querySelector<HTMLElement>(`.reel[data-index="${idx}"]`)
      ?.scrollIntoView({ behavior: 'smooth' });
  };

  const indVisible = pull > 4 || refreshing;

  return (
    <>
      <div
        className={`pull-ind ${refreshing ? 'spinning' : ''}`}
        style={{
          transform: `translate(-50%, ${(refreshing ? PULL_TRIGGER : pull) - 46}px)`,
          opacity: indVisible ? Math.min(1, pull / PULL_TRIGGER || 1) : 0,
        }}
      >
        <span className="pull-spin" style={{ transform: `rotate(${pull * 2.4}deg)` }} />
      </div>

      <div className="reels" ref={containerRef} style={{ touchAction: pull > 0 ? 'none' : undefined }}>
        {items.map((item, i) => (
          <ReelItem
            key={item.id}
            index={i}
            item={item}
            active={!paused && i === activeIndex}
            preload={Math.abs(i - activeIndex) <= 2}
            soundOn={soundOn}
            onSetSound={onSetSound}
            onHide={onHide}
            onEnded={(idx) => goTo(idx + 1)}
            initialLiked={likedIds?.has(item.id)}
            onLikeChange={onLike}
            onOpenChannel={onOpenChannel}
          />
        ))}
      </div>
    </>
  );
}
