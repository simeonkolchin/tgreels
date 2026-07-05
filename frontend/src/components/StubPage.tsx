import type { Page } from '../types';
import BottomNav from './BottomNav';

interface Props {
  title: string;
  emoji: string;
  active: Page;
  onNav: (p: Page) => void;
}

// Заглушка «страница в разработке» с общей навигацией.
export default function StubPage({ title, emoji, active, onNav }: Props) {
  return (
    <div className="page">
      <header className="x-topbar">
        <div className="stub-title">{title}</div>
      </header>
      <div className="feed">
        <div className="placeholder static">
          <div className="empty-emoji">{emoji}</div>
          <p>Страница в разработке</p>
          <span className="hint">Скоро здесь что-то появится.</span>
        </div>
      </div>
      <BottomNav active={active} onNav={onNav} />
    </div>
  );
}
