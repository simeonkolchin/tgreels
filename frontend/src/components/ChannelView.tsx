import { useEffect, useState } from 'react';
import { IconBack, IconGrid, IconReelsTab } from '../icons';
import {
  fetchChannel,
  fetchChannelPhotos,
  fetchChannelVideos,
  type ChannelInfo,
} from '../api';
import type { FeedItem } from '../types';
import Lightbox from './Lightbox';
import ReelsPage from './ReelsPage';

const DEFAULT_AVATAR = '/default-avatar.svg';
function avatarFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (!img.src.endsWith(DEFAULT_AVATAR)) img.src = DEFAULT_AVATAR;
}

// 999→"999", 1234→"1.2K", 1234567→"1.2M" (усечение)
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

function StatBadge({ cls, value, label, show }: { cls: string; value: number; label: string; show: boolean }) {
  return (
    <div className={`stat ${cls} ${show ? 'shown' : ''}`}>
      <div className="stat-inner">
        <div className="stat-num">{fmtStat(value)}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

type Tab = 'photos' | 'videos';

export default function ChannelView({
  channelId,
  name,
  closing,
  onClose,
}: {
  channelId: string;
  name?: string;
  closing: boolean;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<ChannelInfo | null>(null);
  const [tab, setTab] = useState<Tab>('photos');
  const [photos, setPhotos] = useState<string[] | null>(null);
  const [videos, setVideos] = useState<FeedItem[] | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [reels, setReels] = useState<{ items: FeedItem[]; startIndex: number } | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    fetchChannel(channelId).then(setInfo);
  }, [channelId]);

  useEffect(() => {
    const r = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(r);
  }, []);

  useEffect(() => {
    if (tab === 'photos' && photos === null) fetchChannelPhotos(channelId).then(setPhotos);
    if (tab === 'videos' && videos === null) fetchChannelVideos(channelId).then(setVideos);
  }, [tab, channelId, photos, videos]);

  const s = info?.stats;
  const showBadge = revealed && !closing;

  return (
    <div className={`profile channel ${closing ? 'closing' : ''}`}>
      <div className="profile-bar">
        <button className="profile-back" onClick={onClose} aria-label="назад">
          <IconBack />
        </button>
      </div>

      <div className="profile-top">
        <div className="profile-glow" />
        <div className="profile-glow g2" />
        <div className="profile-head">
          <div className="profile-hero">
            {s && s.videos != null && (
              <StatBadge cls="stat-posts" value={s.videos} label="VIDEOS" show={showBadge} />
            )}
            {s && s.subscribers != null && (
              <StatBadge cls="stat-followers" value={s.subscribers} label="SUBS" show={showBadge} />
            )}
            {s && s.photos != null && (
              <StatBadge cls="stat-likes" value={s.photos} label="PHOTOS" show={showBadge} />
            )}
            <div className="profile-ava">
              <img src={info?.photoUrl || `/channel/${channelId}/photo`} alt="" onError={avatarFallback} />
            </div>
          </div>
          <div className="profile-name">{info?.name || name || ' '}</div>
          {info?.username && <div className="profile-username">@{info.username}</div>}
        </div>
      </div>

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
      </div>

      <div className="profile-body">
        {tab === 'photos' &&
          (photos === null ? (
            <div className="profile-empty">Загрузка…</div>
          ) : photos.length > 0 ? (
            <div className="profile-grid">
              {photos.map((url, i) => (
                <button className="profile-cell" key={i} onClick={() => setLightbox(i)}>
                  <img src={url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          ) : (
            <div className="profile-empty">Нет фото</div>
          ))}

        {tab === 'videos' &&
          (videos === null ? (
            <div className="profile-empty">Загрузка…</div>
          ) : videos.length > 0 ? (
            <div className="profile-vgrid">
              {videos.map((v, i) => (
                <button
                  className="profile-vcell"
                  key={v.id}
                  onClick={() => setReels({ items: videos, startIndex: i })}
                >
                  <img src={v.thumbUrl} alt="" onError={avatarFallback} />
                  <span className="vcell-play" />
                </button>
              ))}
            </div>
          ) : (
            <div className="profile-empty">Нет видео</div>
          ))}
      </div>

      {lightbox !== null && photos && photos.length > 0 && (
        <Lightbox photos={photos} start={lightbox} onClose={() => setLightbox(null)} />
      )}

      {reels && (
        <div className="profile-reels-stage">
          <div className="stage reels-stage">
            <ReelsPage
              onGoHome={() => setReels(null)}
              fixed={{ items: reels.items, startIndex: reels.startIndex }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
