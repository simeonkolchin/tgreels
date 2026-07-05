import { IconBack } from '../icons';

// Верхняя панель рилсов: стрелка (→ на главную) + обновить (перемешать ленту).
interface Props {
  onBack: () => void;
  onRefresh: () => void;
}

export default function TopBar({ onBack, onRefresh }: Props) {
  return (
    <div className="topbar">
      <button className="topbar-btn" aria-label="на главную" onClick={onBack}>
        <IconBack />
      </button>
      <div className="topbar-spacer" />
      <button className="topbar-btn" aria-label="обновить" onClick={onRefresh}>
        <img className="img-icon" src="/icons/update.png" alt="" />
      </button>
    </div>
  );
}
