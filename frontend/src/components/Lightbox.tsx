import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Props {
  photos: string[];
  start: number;
  onClose: () => void;
}

// Просмотр фото поста: фото на весь экран (contain, чёрные поля), листание
// свайпом с плавной доводкой. Закрытие — тап (без движения).
export default function Lightbox({ photos, start, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [idx, setIdx] = useState(start);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<'x' | 'y' | null>(null);
  const moved = useRef(false);
  const last = photos.length - 1;

  useLayoutEffect(() => {
    const update = () => setWidth(ref.current?.clientWidth || window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const close = () => {
    setClosing(true);
    window.setTimeout(onClose, 200);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIdx((i) => Math.min(last, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    axis.current = null;
    moved.current = false;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    let dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved.current = true;
    // определяем ось жеста один раз
    if (axis.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      axis.current = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    }
    if (axis.current === 'y') {
      setDragY(dy);
      return;
    }
    // сопротивление на краях
    if ((idx === 0 && dx > 0) || (idx === last && dx < 0)) dx *= 0.3;
    setDragX(dx);
  };
  const onTouchEnd = () => {
    setDragging(false);
    // вертикальный свайп → закрыть
    if (axis.current === 'y' && Math.abs(dragY) > 90) {
      close();
      return;
    }
    setDragY(0);
    const th = (width || 1) * 0.2;
    let n = idx;
    if (dragX <= -th && idx < last) n = idx + 1;
    else if (dragX >= th && idx > 0) n = idx - 1;
    setIdx(n);
    setDragX(0);
  };

  const offset = -idx * width + dragX;
  // затемнение фона слабеет по мере вертикального смахивания
  const bgOpacity = Math.max(0, 1 - Math.abs(dragY) / 500);

  return (
    <div
      className={`lightbox ${closing ? 'closing' : ''}`}
      ref={ref}
      style={{ backgroundColor: `rgba(0,0,0,${bgOpacity})` }}
      onClick={() => {
        if (!moved.current) close();
      }}
    >
      <div
        className={`lb-track ${dragging ? '' : 'anim'}`}
        style={{ transform: `translate3d(${offset}px,${dragY}px,0)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {photos.map((src, i) => (
          <div className="lb-slide" key={i}>
            <img src={src} alt="" draggable={false} />
          </div>
        ))}
      </div>
    </div>
  );
}
