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
}

export default function ReelsFeed({
  items,
  soundOn,
  onSetSound,
  onHide,
  onNearEnd,
  likedIds,
  onLike,
  startIndex = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(startIndex);

  // Открытие с конкретного ролика (тап по превью в профиле) — мгновенный скролл.
  useEffect(() => {
    if (startIndex <= 0) return;
    const root = containerRef.current;
    const el = root?.querySelector<HTMLElement>(`.reel[data-index="${startIndex}"]`);
    el?.scrollIntoView();
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
            const idx = Number((entry.target as HTMLElement).dataset.index);
            setActiveIndex(idx);
          }
        }
      },
      { root, threshold: [0.6] }
    );

    const nodes = root.querySelectorAll('.reel');
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [items.length]);

  // Подгрузка новой пачки, когда до конца осталось <= 3 ролика.
  useEffect(() => {
    if (activeIndex >= items.length - 3) onNearEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, items.length]);

  // Плавный переход к ролику по индексу (scroll-snap подхватит).
  const goTo = (idx: number) => {
    const root = containerRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`.reel[data-index="${idx}"]`);
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="reels" ref={containerRef}>
      {items.map((item, i) => (
        <ReelItem
          key={item.id}
          index={i}
          item={item}
          active={i === activeIndex}
          preload={Math.abs(i - activeIndex) <= 2}
          soundOn={soundOn}
          onSetSound={onSetSound}
          onHide={onHide}
          onEnded={(idx) => goTo(idx + 1)}
          initialLiked={likedIds?.has(item.id)}
          onLikeChange={onLike}
        />
      ))}
    </div>
  );
}
