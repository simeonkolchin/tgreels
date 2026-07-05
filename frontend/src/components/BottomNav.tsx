import { IconBell, IconHome, IconMail, IconReelsNav, IconSearch } from '../icons';
import type { Page } from '../types';

interface Props {
  active: Page;
  onNav: (p: Page) => void;
}

// Нижняя навигация: главная / поиск / рилсы (центр) / уведомления / сообщения.
export default function BottomNav({ active, onNav }: Props) {
  return (
    <nav className="bottom-nav">
      <button className={`nav-btn ${active === 'home' ? 'on' : ''}`} onClick={() => onNav('home')} aria-label="главная">
        <IconHome filled={active === 'home'} />
      </button>
      <button className={`nav-btn ${active === 'search' ? 'on' : ''}`} onClick={() => onNav('search')} aria-label="поиск">
        <IconSearch size={25} />
      </button>
      <button className="nav-btn nav-center" onClick={() => onNav('reels')} aria-label="рилсы">
        <IconReelsNav />
      </button>
      <button className={`nav-btn ${active === 'notifications' ? 'on' : ''}`} onClick={() => onNav('notifications')} aria-label="уведомления">
        <IconBell filled={active === 'notifications'} />
      </button>
      <button className={`nav-btn ${active === 'messages' ? 'on' : ''}`} onClick={() => onNav('messages')} aria-label="сообщения">
        <IconMail filled={active === 'messages'} />
      </button>
    </nav>
  );
}
