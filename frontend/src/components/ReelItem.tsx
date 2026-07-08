import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FeedItem } from '../types';
import { reindexFeed } from '../api';
import {
  IconDots,
  IconNotInterested,
  IconPlay,
  IconVolumeOff,
  IconVolumeOn,
} from '../icons';

// Лёгкая вибро-отдача (Android поддерживает; iOS Safari — нет, там просто игнор).
function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* iOS не умеет */
  }
}

// Заглушка для каналов без аватарки (замени файл frontend/public/default-avatar.svg).
const DEFAULT_AVATAR = '/default-avatar.svg';

function avatarFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (!img.src.endsWith(DEFAULT_AVATAR)) img.src = DEFAULT_AVATAR;
}

// Копирование в буфер: clipboard API в secure-контексте, иначе fallback через textarea
// (нужно для доступа по http://LAN-ip, где clipboard недоступен).
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* пробуем fallback */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

interface Props {
  index: number;
  item: FeedItem;
  active: boolean;
  preload: boolean;
  soundOn: boolean;
  onSetSound: (value: boolean) => void;
  onHide: (id: number) => void;
  onEnded: (index: number) => void;
  initialLiked?: boolean;
  onLikeChange?: (id: number, liked: boolean) => void;
}

export default function ReelItem({
  index,
  item,
  active,
  preload,
  soundOn,
  onSetSound,
  onHide,
  onEnded,
  initialLiked = false,
  onLikeChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  // Горизонтальные ролики поворачиваем на 90° по часовой (низ уходит влево).
  // Квадратные/вертикальные — без изменений.
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const upd = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const horizontal = item.width > 0 && item.height > 0 && item.width > item.height;
  const rotatedStyle: React.CSSProperties | undefined =
    horizontal && box.w
      ? {
          inset: 'auto',
          top: '50%',
          left: '50%',
          width: box.h,
          height: box.w,
          transform: 'translate(-50%, -50%) rotate(90deg)',
        }
      : undefined;
  const [buffering, setBuffering] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [liked, setLiked] = useState(initialLiked);
  const [breaking, setBreaking] = useState(false); // анимация «разбитого сердца» при снятии лайка
  const [followed, setFollowed] = useState(false);
  const [speeding, setSpeeding] = useState(false); // удержание справа → 2x
  const lastTapRef = useRef(0);
  const holdTimer = useRef<number | undefined>(undefined);
  const holdActive = useRef(false);
  const suppressClick = useRef(false);
  const downX = useRef(0);
  const downY = useRef(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetClosing, setSheetClosing] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<{ added: number; videos: number } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareClosing, setShareClosing] = useState(false);
  const [copied, setCopied] = useState(false);

  // src подставляем только когда ролик рядом — экономим трафик и коннекты к TG.
  const src = preload ? item.streamUrl : undefined;

  // Играем активный, паузим остальные. НЕ зависит от soundOn (иначе смена звука
  // дёргала бы play/pause). muted берём из ref в момент старта.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.muted = !soundOnRef.current;
      v.play()
        .then(() => setPaused(false))
        .catch(() => {
          // автоплей со звуком заблокирован → запускаем без звука, чтобы шло.
          // soundOn (намерение) НЕ трогаем — иконка остаётся «звук вкл».
          v.muted = true;
          v.play()
            .then(() => setPaused(false))
            .catch(() => setPaused(true));
        });
    } else {
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* noop */
      }
      v.playbackRate = 1;
      setPaused(false);
      setProgress(0);
      setSpeeding(false);
    }
  }, [active, src]);

  // Применяем состояние звука к текущему видео — без play/pause (пауза не слетает).
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = !soundOn;
  }, [soundOn]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.muted = !soundOn;
      v.play();
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
  };

  // Двойной тап по видео → ТОЛЬКО активация лайка (без центральной анимации).
  const likeFromDoubleTap = () => {
    if (!liked) {
      setLiked(true);
      onLikeChange?.(item.id, true);
      haptic(14);
    }
  };

  // Одиночный тап = play/pause; двойной = лайк (двойной «отменяет» первый toggle,
  // поэтому воспроизведение не залипает).
  const onVideoTap = () => {
    if (suppressClick.current) {
      suppressClick.current = false; // это было удержание 2x, не тап
      return;
    }
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      togglePlay(); // отменяем toggle от первого тапа
      likeFromDoubleTap();
    } else {
      lastTapRef.current = now;
      togglePlay();
    }
  };

  // Удержание в ПРАВОЙ части экрana → ускорение 2x, пока не отпустишь.
  const stopSpeed = () => {
    window.clearTimeout(holdTimer.current);
    if (holdActive.current) {
      const v = videoRef.current;
      if (v) v.playbackRate = 1;
      holdActive.current = false;
      suppressClick.current = true; // не давать клику после удержания
      setSpeeding(false);
    }
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!active) return;
    downX.current = e.clientX;
    downY.current = e.clientY;
    holdActive.current = false;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isRight = e.clientX - rect.left > rect.width * 0.55;
    if (!isRight) return;
    holdTimer.current = window.setTimeout(() => {
      const v = videoRef.current;
      if (!v) return;
      holdActive.current = true;
      v.playbackRate = 2;
      if (v.paused) {
        v.play().catch(() => {});
        setPaused(false);
      }
      setSpeeding(true);
    }, 220);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    // движение = скролл/свайп → отменяем удержание
    if (Math.abs(e.clientX - downX.current) > 12 || Math.abs(e.clientY - downY.current) > 12) {
      window.clearTimeout(holdTimer.current);
      if (holdActive.current) stopSpeed();
    }
  };

  // Клик по самой кнопке сердца: тумблер. Снятие лайка → анимация «разбитого сердца».
  const onHeartClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (liked) {
      setLiked(false);
      onLikeChange?.(item.id, false);
      setBreaking(true);
      haptic(20);
      window.setTimeout(() => setBreaking(false), 520);
    } else {
      setLiked(true);
      onLikeChange?.(item.id, true);
      haptic(14);
    }
  };

  // Во весь экран. На iOS — нативный плеер (webkitEnterFullscreen), он показывает
  // видео в его РОДНОЙ ориентации, игнорируя наш CSS-поворот → горизонтальное
  // откроется горизонтально. На десктопе/Android — requestFullscreen + CSS-сброс.
  const goFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current as
      | (HTMLVideoElement & {
          webkitEnterFullscreen?: () => void;
          webkitRequestFullscreen?: () => void;
        })
      | null;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
  };

  // Кнопка звука: только переключаем намерение (soundOn). Пауза НЕ слетает —
  // применение mute делает отдельный эффект, без play().
  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSetSound(!soundOn);
  };

  // длительность анимации закрытия (совпадает с CSS)
  const CLOSE_MS = 220;

  const openShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCopied(false);
    setShareClosing(false);
    setShareOpen(true);
  };
  const closeShare = () => {
    setShareClosing(true);
    setTimeout(() => {
      setShareOpen(false);
      setShareClosing(false);
    }, CLOSE_MS);
  };

  const doCopy = async () => {
    if (!item.postUrl) return;
    const ok = await copyText(item.postUrl);
    if (ok) setCopied(true);
  };

  const openSheet = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSheetClosing(false);
    setReindexResult(null);
    setSheetOpen(true);
  };

  const doReindex = async () => {
    if (reindexing) return;
    setReindexing(true);
    setReindexResult(null);
    try {
      const r = await reindexFeed();
      setReindexResult({ added: r.added, videos: r.videos });
    } catch {
      setReindexResult({ added: -1, videos: 0 });
    } finally {
      setReindexing(false);
    }
  };
  const closeSheet = () => {
    setSheetClosing(true);
    setTimeout(() => {
      setSheetOpen(false);
      setSheetClosing(false);
    }, CLOSE_MS);
  };

  const menuActive = sheetOpen || shareOpen; // пока любое меню открыто — луп

  const notInterested = () => {
    setSheetOpen(false);
    onHide(item.id); // убрать из ленты + пометить на сервере
  };

  const name = (item.channel || 'канал').toLowerCase();

  return (
    <div className="reel" data-index={index}>
      <div className="video-wrap" ref={wrapRef}>
        <img className="poster" src={item.thumbUrl} alt="" loading="lazy" style={rotatedStyle} />
        {src && (
          <video
            ref={videoRef}
            className="video"
            src={src}
            poster={item.thumbUrl}
            style={rotatedStyle}
            autoPlay={active}
            playsInline
            preload="auto"
            // пока открыто меню — крутим в лупе, не листаем на следующее
            loop={menuActive}
            onClick={onVideoTap}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stopSpeed}
            onPointerCancel={stopSpeed}
            onPointerLeave={stopSpeed}
            onWaiting={() => setBuffering(true)}
            onPlaying={() => {
              setBuffering(false);
              setPaused(false);
            }}
            onTimeUpdate={(e) => {
              const v = e.target as HTMLVideoElement;
              if (v.duration) setProgress(v.currentTime / v.duration);
            }}
            onEnded={() => {
              if (!menuActive) onEnded(index);
            }}
          />
        )}

        {buffering && active && !paused && <div className="spinner" />}

        {speeding && <div className="speed-badge">2x</div>}

        {active && (
          <button className="reel-fs" onClick={goFullscreen} aria-label="во весь экран">
            <span className="fs-ic" />
          </button>
        )}

        {paused && active && (
          <div className="center-controls">
            <button className="sound-btn" onClick={toggleSound} aria-label="звук">
              {soundOn ? <IconVolumeOn size={15} /> : <IconVolumeOff size={15} />}
            </button>
            <button className="play-btn" onClick={togglePlay} aria-label="play">
              <IconPlay size={28} />
            </button>
          </div>
        )}

        {/* Правый рельс действий */}
        <div className="actions">
          <button className="act like-btn" onClick={onHeartClick} aria-label="нравится">
            {breaking ? (
              <span className="heart-break">
                <span className="heart-half hl" />
                <span className="heart-half hr" />
              </span>
            ) : liked ? (
              <span className="heart-fill" />
            ) : (
              <img className="img-icon" src="/icons/like.png" alt="" />
            )}
          </button>

          <button className="act" onClick={(e) => e.stopPropagation()} aria-label="комментарии">
            <img className="img-icon" src="/icons/comment-1.png" alt="" />
          </button>

          <button className="act" onClick={openShare} aria-label="поделиться">
            <img className="img-icon" src="/icons/send.png" alt="" />
          </button>

          <button className="act act-dots" onClick={openSheet} aria-label="ещё">
            <IconDots size={26} className="svg-icon" />
          </button>

          <div className="audio-disc">
            <img src={item.channelPhotoUrl} alt="" onError={avatarFallback} />
          </div>
        </div>

        {/* Инфо канала + описание (слева снизу) */}
        <div className="overlay-bottom" onClick={(e) => e.stopPropagation()}>
          <div className="channel-row">
            <div className="channel-ava">
              <img src={item.channelPhotoUrl} alt="" onError={avatarFallback} />
            </div>
            <span className="channel-name">{name}</span>
            <button
              className={`follow-btn ${followed ? 'following' : ''}`}
              onClick={() => setFollowed((f) => !f)}
            >
              {followed ? 'Вы подписаны' : 'Подписаться'}
            </button>
          </div>

          {item.caption && (
            <div className="caption-box">
              <div className={`caption ${expanded ? 'expanded' : ''}`}>{item.caption}</div>
              {item.caption.length > 60 && (
                <button className="more-toggle" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? 'свернуть' : 'ещё'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Тонкий прогресс-бар — всегда у нижней границы экрана */}
        <div className="progress">
          <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {/* Выезжающая снизу панель действий */}
      {sheetOpen && (
        <div className={`sheet-backdrop ${sheetClosing ? 'closing' : ''}`} onClick={closeSheet}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grabber" />
            <div className="sheet-list">
              <button className="sheet-item" onClick={doReindex} disabled={reindexing}>
                <img className="sheet-ic-img" src="/icons/download.png" alt="" />
                <span className="sheet-label">Обновить ленту</span>
              </button>

              {reindexing && (
                <div className="reindex-status">
                  <div className="reindex-bar">
                    <div className="reindex-fill" />
                  </div>
                  <span className="reindex-text">Обновляю ленту…</span>
                </div>
              )}
              {!reindexing && reindexResult && (
                <div className="reindex-status">
                  <span className="reindex-text done">
                    {reindexResult.added < 0
                      ? 'Не удалось обновить'
                      : `Готово · +${reindexResult.added} новых, всего ${reindexResult.videos} видео`}
                  </span>
                </div>
              )}

              <button className="sheet-item danger" onClick={notInterested}>
                <IconNotInterested size={22} className="sheet-ic" />
                <span className="sheet-label">Не интересует</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Панель «Поделиться» */}
      {shareOpen && (
        <div className={`sheet-backdrop ${shareClosing ? 'closing' : ''}`} onClick={closeShare}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grabber" />

            <div className="share-card">
              <div className="share-ava">
                <img src={item.channelPhotoUrl} alt="" onError={avatarFallback} />
              </div>
              <div className="share-info">
                <div className="share-name">{name}</div>
                <div className="share-sub">
                  {item.caption ? item.caption : `Видео #${item.messageId}`}
                </div>
              </div>
            </div>

            {item.postUrl ? (
              <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={doCopy}>
                {copied ? 'Скопировано' : 'Скопировать'}
              </button>
            ) : (
              <button className="copy-btn disabled" disabled>
                Ссылка недоступна (приватный канал)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
