import { IconBack } from '../icons';

// Верхняя панель рилсов: стрелка (→ на главную). Обновление ленты — жестом
// «потянуть вниз» из верхней зоны экрана (кнопка убрана).
export default function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <div className="topbar">
      <button className="topbar-btn" aria-label="на главную" onClick={onBack}>
        <IconBack />
      </button>
      <div className="topbar-spacer" />
    </div>
  );
}
