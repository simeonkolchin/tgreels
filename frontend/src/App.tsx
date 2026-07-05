import { useState } from 'react';
import type { Page } from './types';
import ReelsPage from './components/ReelsPage';
import HomePage from './components/HomePage';
import StubPage from './components/StubPage';

export default function App() {
  // Приложение открывается на рилсах; стрелка в рилсах ведёт на главную.
  const [page, setPage] = useState<Page>('reels');

  return (
    <div className="app">
      <div className={`stage ${page === 'reels' ? 'reels-stage' : ''}`}>
        {page === 'reels' && <ReelsPage onGoHome={() => setPage('home')} />}
        {page === 'home' && <HomePage onNav={setPage} />}
        {page === 'search' && (
          <StubPage title="Поиск" emoji="🔍" active="search" onNav={setPage} />
        )}
        {page === 'notifications' && (
          <StubPage title="Уведомления" emoji="🔔" active="notifications" onNav={setPage} />
        )}
        {page === 'messages' && (
          <StubPage title="Сообщения" emoji="✉️" active="messages" onNav={setPage} />
        )}
      </div>
    </div>
  );
}
