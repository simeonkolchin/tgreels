import { useEffect, useState } from 'react';
import { IconBack, IconMenu, IconGrid, IconReelsTab, IconHeartTab } from '../icons';
import {
  fetchGallery,
  fetchLikes,
  fetchMe,
  fetchMyVideos,
  fetchStats,
  type Gallery,
  type Me,
  type Stats,
} from '../api';
import type { FeedItem } from '../types';
import Lightbox from './Lightbox';
import ReelsPage from './ReelsPage';

const DEFAULT_AVATAR = '/default-avatar.svg';

function avatarFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (!img.src.endsWith(DEFAULT_AVATAR)) img.src = DEFAULT_AVATAR;
}

type Tab = 'photos' | 'videos' | 'likes';

// 999→"999", 1000→"1K", 1234→"1.2K", 102498→"102.4K", 1234567→"1.2M" (усечение, не округление)
function fmtStat(n: number): string {
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [div, suf] of units) {
    if (n >= div) {
      const v = Math.floor((n / div) * 10) / 10;
      return (Number.isInteger(v) ? String(v) : v.toFixed(1)) + suf;
    }
  }
  return String(n);
}

// Бейдж статистики: когда show=true — выплывает из-под аватара на своё место,
// когда false — заезжает обратно за аватар (z-index ниже аватара).
function StatBadge({
  cls,
  value,
  label,
  show,
}: {
  cls: string;
  value: number;
  label: string;
  show: boolean;
}) {
  return (
    <div className={`stat ${cls} ${show ? 'shown' : ''}`}>
      <div className="stat-inner">
        <div className="stat-num">{fmtStat(value)}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

export default function ProfileView({
  closing,
  onClose,
}: {
  closing: boolean;
  onClose: () => void;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [stats, setStats] = useState<Stats>({
    posts: null,
    followers: null,
    likes: null,
    channels: null,
    chats: null,
    saved: null,
    computing: true,
  });
  const [tab, setTab] = useState<Tab>('photos');
  const [statPage, setStatPage] = useState(0); // 0 — посты/подписчики/лайки, 1 — каналы/чаты/возраст
  const [revealed, setRevealed] = useState(false); // rAF-гейт: первый показ тоже выплывает из-за аватара

  const [videos, setVideos] = useState<{ channel: boolean; items: FeedItem[] } | null>(null);
  const [likes, setLikes] = useState<FeedItem[] | null>(null);

  // просмотрщики
  const [lightbox, setLightbox] = useState<number | null>(null); // индекс фото
  const [reels, setReels] = useState<{ items: FeedItem[]; startIndex: number; likedAll: boolean } | null>(
    null,
  );

  useEffect(() => {
    fetchMe().then(setMe);
    fetchGallery().then(setGallery);
  }, []);

  // rAF-гейт: даём первому набору выплыть из-за аватара (а не появиться сразу).
  useEffect(() => {
    const r = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(r);
  }, []);

  // Статистика: опрашиваем сервер, пока не посчитаются все цифры
  // (каждая всплывает, как только пришла).
  useEffect(() => {
    let alive = true;
    let tries = 0;
    let timer: number | undefined;
    const tick = async () => {
      const s = await fetchStats();
      if (!alive) return;
      setStats(s);
      const done =
        s.posts != null &&
        s.followers != null &&
        s.likes != null &&
        s.channels != null &&
        s.chats != null &&
        s.saved != null;
      if (!done && tries < 40) {
        tries += 1;
        timer = window.setTimeout(tick, 1500);
      }
    };
    tick();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  // ленивая подгрузка разделов
  useEffect(() => {
    if (tab === 'videos' && videos === null) fetchMyVideos().then(setVideos);
    if (tab === 'likes' && likes === null) fetchLikes().then(setLikes);
  }, [tab, videos, likes]);

  const photoUrls = (gallery?.photos ?? []).map((id) => `/api/me/gphoto?id=${id}`);

  return (
    <div className={`profile ${closing ? 'closing' : ''}`}>
      {/* липкая панель: назад + меню — всегда сверху при скролле */}
      <div className="profile-bar">
        <button className="profile-back" onClick={onClose} aria-label="назад">
          <IconBack />
        </button>
        <button className="profile-gear" aria-label="меню">
          <IconMenu />
        </button>
      </div>

      {/* шапка с аватаром и розовым свечением — уезжает при скролле */}
      <div className="profile-top">
        <div className="profile-glow" />
        <div className="profile-head">
          <div className="profile-hero">
            {/* страница 1 — посты / подписчики / лайки */}
            {stats.posts != null && (
              <StatBadge
                cls="stat-posts"
                value={stats.posts}
                label="POSTS"
                show={revealed && !closing && statPage === 0}
              />
            )}
            {stats.followers != null && (
              <StatBadge
                cls="stat-followers"
                value={stats.followers}
                label="FOLLOWERS"
                show={revealed && !closing && statPage === 0}
              />
            )}
            {stats.likes != null && (
              <StatBadge
                cls="stat-likes"
                value={stats.likes}
                label="LIKES"
                show={revealed && !closing && statPage === 0}
              />
            )}

            {/* страница 2 — каналы / чаты / возраст (другие места) */}
            {stats.channels != null && (
              <StatBadge
                cls="stat-channels"
                value={stats.channels}
                label="CHANNELS"
                show={revealed && !closing && statPage === 1}
              />
            )}
            {stats.chats != null && (
              <StatBadge
                cls="stat-chats"
                value={stats.chats}
                label="CHATS"
                show={revealed && !closing && statPage === 1}
              />
            )}
            {stats.saved != null && (
              <StatBadge
                cls="stat-saved"
                value={stats.saved}
                label="SAVED"
                show={revealed && !closing && statPage === 1}
              />
            )}

            <button
              className="profile-ava"
              onClick={() => setStatPage((p) => (p === 0 ? 1 : 0))}
              aria-label="другая статистика"
            >
              <img src="/api/me/photo?i=0" alt="" onError={avatarFallback} />
            </button>
          </div>
          <div className="profile-name">{me?.name || ' '}</div>
          {me?.username && <div className="profile-username">@{me.username}</div>}
        </div>
      </div>

      {/* переключатель разделов — прилипает под панелью */}
      <div className="profile-tabs">
        <button
          className={`ptab ${tab === 'photos' ? 'active' : ''}`}
          onClick={() => setTab('photos')}
          aria-label="фото"
        >
          <IconGrid />
        </button>
        <button
          className={`ptab ${tab === 'videos' ? 'active' : ''}`}
          onClick={() => setTab('videos')}
          aria-label="видео"
        >
          <IconReelsTab />
        </button>
        <button
          className={`ptab ${tab === 'likes' ? 'active' : ''}`}
          onClick={() => setTab('likes')}
          aria-label="лайки"
        >
          <IconHeartTab />
        </button>
      </div>

      {/* контент раздела (чёрный фон, без свечения) */}
      <div className="profile-body">
        {tab === 'photos' &&
          (photoUrls.length > 0 ? (
            <div className="profile-grid">
              {photoUrls.map((url, i) => (
                <button className="profile-cell" key={i} onClick={() => setLightbox(i)}>
                  <img src={url} alt="" onError={avatarFallback} />
                </button>
              ))}
            </div>
          ) : (
            gallery && (
              <div className="profile-empty">
                {gallery.channel ? 'В канале пока нет фото' : 'Нет фото'}
              </div>
            )
          ))}

        {tab === 'videos' &&
          (videos === null ? (
            <div className="profile-empty">Загрузка…</div>
          ) : videos.items.length > 0 ? (
            <div className="profile-vgrid">
              {videos.items.map((v, i) => (
                <button
                  className="profile-vcell"
                  key={v.id}
                  onClick={() => setReels({ items: videos.items, startIndex: i, likedAll: false })}
                >
                  <img src={v.thumbUrl} alt="" onError={avatarFallback} />
                  <span className="vcell-play" />
                </button>
              ))}
            </div>
          ) : (
            <div className="profile-empty">
              {videos.channel ? 'В канале пока нет видео' : 'Нет видео'}
            </div>
          ))}

        {tab === 'likes' &&
          (likes === null ? (
            <div className="profile-empty">Загрузка…</div>
          ) : likes.length > 0 ? (
            <div className="profile-vgrid">
              {likes.map((v, i) => (
                <button
                  className="profile-vcell"
                  key={v.id}
                  onClick={() => setReels({ items: likes, startIndex: i, likedAll: true })}
                >
                  <img src={v.thumbUrl} alt="" onError={avatarFallback} />
                  <span className="vcell-play" />
                </button>
              ))}
            </div>
          ) : (
            <div className="profile-empty">Пока нет понравившихся видео</div>
          ))}
      </div>

      {/* просмотр фото листанием */}
      {lightbox !== null && photoUrls.length > 0 && (
        <Lightbox photos={photoUrls} start={lightbox} onClose={() => setLightbox(null)} />
      )}

      {/* просмотр видео/лайков — та же страница рилсов, только «назад» ведёт в профиль */}
      {reels && (
        <div className="profile-reels-stage">
          <div className="stage reels-stage">
            <ReelsPage
              onGoHome={() => setReels(null)}
              fixed={{ items: reels.items, startIndex: reels.startIndex, likedAll: reels.likedAll }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
