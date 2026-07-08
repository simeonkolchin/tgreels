import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPhotos } from '../api';
import type { Page, PhotoPost } from '../types';
import { IconPersonPlus } from '../icons';
import BottomNav from './BottomNav';
import PostCard from './PostCard';
import Lightbox from './Lightbox';
import ProfileView from './ProfileView';

const DEFAULT_AVATAR = '/default-avatar.svg';
function avatarFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (!img.src.endsWith(DEFAULT_AVATAR)) img.src = DEFAULT_AVATAR;
}

export default function HomePage({
  onNav,
  onOpenChannel,
}: {
  onNav: (p: Page) => void;
  onOpenChannel?: (id: string, name?: string) => void;
}) {
  const seedRef = useRef(Math.floor(Math.random() * 1_000_000_000));
  const [items, setItems] = useState<PhotoPost[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loaded, setLoaded] = useState(false);
  const [viewer, setViewer] = useState<{ photos: string[]; index: number } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileClosing, setProfileClosing] = useState(false);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const openProfile = () => {
    setProfileClosing(false);
    setProfileOpen(true);
  };
  const closeProfile = () => {
    setProfileClosing(true);
    window.setTimeout(() => {
      setProfileOpen(false);
      setProfileClosing(false);
    }, 480);
  };
  const profileActive = profileOpen && !profileClosing;

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
    <div className={`page ${profileActive ? 'profile-active' : ''}`}>
      <header className="x-topbar">
        <button className="x-topbar-btn account-btn" onClick={openProfile} aria-label="профиль">
          <span className="account-ava">
            <img src="/api/me/photo?i=0" alt="" onError={avatarFallback} />
          </span>
        </button>
        <img className="r-logo-img" src="/r-white.png" alt="R" />
        <button className="x-topbar-btn logo-side" aria-label="добавить">
          <IconPersonPlus />
        </button>
      </header>

      <div className="feed">
        {items.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onOpenPhoto={(photos, index) => setViewer({ photos, index })}
            onOpenChannel={onOpenChannel}
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

      {profileOpen && <ProfileView closing={profileClosing} onClose={closeProfile} />}

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
