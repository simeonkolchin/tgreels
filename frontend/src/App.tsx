import { useEffect, useState } from 'react';
import type { Page } from './types';
import { authStatus } from './api';
import ReelsPage from './components/ReelsPage';
import HomePage from './components/HomePage';
import StubPage from './components/StubPage';
import AuthPage from './components/AuthPage';

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [page, setPage] = useState<Page>('reels');

  useEffect(() => {
    authStatus().then(setAuthed);
  }, []);

  if (authed === null) {
    return (
      <div className="app">
        <div className="stage reels-stage">
          <div className="placeholder">
            <div className="spinner" />
          </div>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="app">
        <div className="stage reels-stage">
          {/* AuthPage ведёт весь онбординг: вход → загрузка → результат → «Смотреть» */}
          <AuthPage
            onDone={() => {
              setPage('home');
              setAuthed(true);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className={`stage ${page === 'reels' ? 'reels-stage' : ''}`}>
        {page === 'reels' && <ReelsPage onGoHome={() => setPage('home')} />}
        {page === 'home' && <HomePage onNav={setPage} />}
        {page === 'search' && <StubPage title="Поиск" emoji="🔍" active="search" onNav={setPage} />}
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
