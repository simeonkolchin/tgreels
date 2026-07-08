import { useEffect, useState } from 'react';
import type { Page } from './types';
import { authStatus } from './api';
import ReelsPage from './components/ReelsPage';
import HomePage from './components/HomePage';
import StubPage from './components/StubPage';
import AuthPage from './components/AuthPage';
import ChannelView from './components/ChannelView';

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [page, setPage] = useState<Page>('reels');
  const [channel, setChannel] = useState<{ id: string; name?: string } | null>(null);
  const [channelClosing, setChannelClosing] = useState(false);

  const openChannel = (id: string, name?: string) => {
    setChannelClosing(false);
    setChannel({ id, name });
  };
  const closeChannel = () => {
    setChannelClosing(true);
    window.setTimeout(() => {
      setChannel(null);
      setChannelClosing(false);
    }, 480);
  };

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
        {page === 'reels' && (
          <ReelsPage onGoHome={() => setPage('home')} onOpenChannel={openChannel} paused={!!channel} />
        )}
        {page === 'home' && <HomePage onNav={setPage} onOpenChannel={openChannel} />}
        {page === 'search' && <StubPage title="Поиск" emoji="🔍" active="search" onNav={setPage} />}
        {page === 'notifications' && (
          <StubPage title="Уведомления" emoji="🔔" active="notifications" onNav={setPage} />
        )}
        {page === 'messages' && (
          <StubPage title="Сообщения" emoji="✉️" active="messages" onNav={setPage} />
        )}

        {channel && (
          <ChannelView
            channelId={channel.id}
            name={channel.name}
            closing={channelClosing}
            onClose={closeChannel}
          />
        )}
      </div>
    </div>
  );
}
