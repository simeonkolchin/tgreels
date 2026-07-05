import { useState } from 'react';
import type { PhotoPost } from '../types';
import Collage from './Collage';

const DEFAULT_AVATAR = '/default-avatar.svg';

function avatarFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (!img.src.endsWith(DEFAULT_AVATAR)) img.src = DEFAULT_AVATAR;
}

interface Props {
  post: PhotoPost;
  onOpenPhoto: (photos: string[], index: number) => void;
}

// Пост X-стиля: аватар + имя канала + текст, снизу коллаж из фото.
export default function PostCard({ post, onOpenPhoto }: Props) {
  const [expanded, setExpanded] = useState(false);
  const name = post.channel || 'канал';

  return (
    <article className="post">
      <div className="post-ava">
        <img src={post.channelPhotoUrl} alt="" onError={avatarFallback} />
      </div>
      <div className="post-body">
        <div className="post-head">
          <span className="post-name">{name}</span>
          {post.username && <span className="post-handle">@{post.username}</span>}
        </div>

        {post.caption && (
          <>
            <div className={`post-text ${expanded ? 'expanded' : ''}`}>{post.caption}</div>
            {!expanded && post.caption.length > 180 && (
              <button className="post-more" onClick={() => setExpanded(true)}>
                Показать ещё
              </button>
            )}
          </>
        )}

        <Collage photos={post.photos} onOpen={(i) => onOpenPhoto(post.photos, i)} />
      </div>
    </article>
  );
}
