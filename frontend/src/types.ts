export interface FeedItem {
  id: number;
  streamUrl: string;
  thumbUrl: string;
  width: number;
  height: number;
  duration: number;
  caption: string;
  channel: string;
  channelId: string;
  username: string | null;
  messageId: number;
  channelPhotoUrl: string;
  postUrl: string | null;
}

export interface FeedResponse {
  items: FeedItem[];
  offset: number;
  limit: number;
  total: number;
  next: number | null;
}

export interface PhotoPost {
  id: number;
  channel: string;
  channelId: string;
  username: string | null;
  caption: string;
  channelPhotoUrl: string;
  photos: string[];
  postUrl: string | null;
}

export interface PhotoResponse {
  items: PhotoPost[];
  offset: number;
  limit: number;
  total: number;
  next: number | null;
}

export type Page = 'reels' | 'home' | 'search' | 'notifications' | 'messages';
