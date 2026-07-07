import { useState } from 'react';
import { authCode, authPassword, authStart, reindexFeed } from '../api';
import CodeInput from './CodeInput';

interface MediaItem {
  video: boolean;
  url: string;
  poster?: string;
}

type Step = 'creds' | 'code' | 'password' | 'loading' | 'result';

// плавающие карточки: крупные, с наездом. front → над буквой R, остальные под ней
const MEDIA = [
  { top: '5%', left: '1%', w: 134, rot: -13, dir: -1, up: true, front: false, d: 0 },
  { top: '0%', left: '47%', w: 152, rot: 8, dir: 1, up: true, front: true, d: 90 },
  { top: '20%', left: '64%', w: 122, rot: -6, dir: 1, up: true, front: false, d: 170 },
  { top: '64%', left: '1%', w: 144, rot: 9, dir: -1, up: false, front: false, d: 130 },
  { top: '75%', left: '49%', w: 136, rot: -10, dir: 1, up: false, front: false, d: 210 },
  { top: '60%', left: '31%', w: 118, rot: 4, dir: -1, up: false, front: false, d: 280 },
];

export default function AuthPage({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('creds');
  const [cardOut, setCardOut] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [counts, setCounts] = useState({ videos: 0, photos: 0 });
  const [media, setMedia] = useState<MediaItem[]>([]);

  const goToStep = (next: Step) => {
    setCardOut(true);
    window.setTimeout(() => {
      setStep(next);
      setError(null);
      setCardOut(false);
    }, 600);
  };

  // после успешного входа: панель уезжает вниз → загрузка по центру (фон на месте)
  const goToLoading = () => {
    setCardOut(true);
    window.setTimeout(() => {
      setStep('loading');
      runOnboard();
    }, 600);
  };

  // реальная обработка: прогресс до 90% пока идёт индексация, затем счётчики + постеры
  const runOnboard = async () => {
    let p = 0;
    const id = window.setInterval(() => {
      p += Math.random() * 6 + 2;
      if (p >= 90) {
        p = 90;
        window.clearInterval(id);
      }
      setProgress(Math.round(p));
    }, 300);
    try {
      const r = await reindexFeed();
      setCounts({ videos: r.videos, photos: r.photos });
      await fetchMedia();
    } catch {
      /* при ошибке покажем что есть */
    }
    window.clearInterval(id);
    setProgress(100);
    window.setTimeout(() => setStep('result'), 450);
  };

  // тянем немного реальных постеров: фото из /api/photos + превью видео из /api/feed
  const fetchMedia = async () => {
    try {
      const seed = Math.floor(Math.random() * 1_000_000_000);
      const [ph, fe] = await Promise.all([
        fetch(`/api/photos?seed=${seed}&offset=0&limit=3`).then((r) => r.json()),
        fetch(`/api/feed?seed=${seed}&offset=0&limit=20`).then((r) => r.json()),
      ]);
      const photos: MediaItem[] = (ph.items || [])
        .map((p: { photos?: string[] }) => ({ video: false, url: p.photos?.[0] as string }))
        .filter((x: MediaItem) => x.url);
      const vids: MediaItem[] = (fe.items || [])
        .filter((v: { duration?: number }) => !v.duration || v.duration <= 30)
        .slice(0, 3)
        .map((v: { streamUrl: string; thumbUrl: string }) => ({
          video: true,
          url: v.streamUrl,
          poster: v.thumbUrl,
        }))
        .filter((x: MediaItem) => x.url);
      const mix: MediaItem[] = [];
      const n = Math.max(photos.length, vids.length);
      for (let i = 0; i < n; i++) {
        if (photos[i]) mix.push(photos[i]);
        if (vids[i]) mix.push(vids[i]);
      }
      setMedia(mix.slice(0, MEDIA.length));
    } catch {
      /* оставим рамки-плейсхолдеры */
    }
  };

  // «Смотреть»: улетает всё (R, кружки, карточки) → главная
  const finish = () => {
    setFinishing(true);
    window.setTimeout(onDone, 780);
  };

  const submitCreds = async () => {
    setError(null);
    if (!apiId.trim() || !apiHash.trim() || !phone.trim()) {
      setError('Заполни все поля');
      return;
    }
    setLoading(true);
    const r = await authStart(Number(apiId.trim()), apiHash, phone);
    setLoading(false);
    if (!r.ok) return setError(r.error || 'Не удалось отправить код');
    goToStep('code');
  };

  const submitCode = async () => {
    setError(null);
    if (!code.trim()) return setError('Введи код');
    setLoading(true);
    const r = await authCode(code);
    setLoading(false);
    if (!r.ok) return setError(r.error || 'Неверный код');
    if (r.step === 'password') return goToStep('password');
    if (r.step === 'done') goToLoading();
  };

  const submitPassword = async () => {
    setError(null);
    if (!password) return setError('Введи пароль');
    setLoading(true);
    const r = await authPassword(password);
    setLoading(false);
    if (!r.ok) return setError(r.error || 'Неверный пароль');
    if (r.step === 'done') goToLoading();
  };

  const status =
    progress < 30
      ? 'Подключаемся к аккаунту…'
      : progress < 60
        ? 'Сканируем каналы…'
        : progress < 90
          ? 'Собираем ленту…'
          : 'Почти готово…';

  const isForm = step === 'creds' || step === 'code' || step === 'password';

  return (
    <div className={`auth ${finishing ? 'finishing' : ''}`}>
      <div className="auth-bg">
        <span className="blob b1" />
        <img className="bg-r" src="/r-glass.png" alt="" />
      </div>
      <span className="blob b2" />

      {/* плавающие карточки медиа (на экране результата) */}
      {step === 'result' && (
        <div className="float-layer">
          {MEDIA.map((m, i) =>
            media[i] ? (
              <div
                key={i}
                className="float-card"
                style={{
                  top: m.top,
                  left: m.left,
                  width: m.w,
                  transform: `rotate(${m.rot}deg)`,
                  zIndex: m.front ? 3 : 1,
                }}
              >
                <div
                  className="float-card-inner"
                  style={
                    {
                      '--d': `${m.d}ms`,
                      '--fromx': `${m.dir * 160}vw`,
                      '--fly': m.up ? '-130vh' : '130vh',
                    } as React.CSSProperties
                  }
                >
                  {media[i].video ? (
                    <video
                      className="float-img"
                      src={media[i].url}
                      poster={media[i].poster}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="auto"
                    />
                  ) : (
                    <img className="float-img" src={media[i].url} alt="" />
                  )}
                </div>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* авторизация (нижняя панель) */}
      {isForm && (
        <div className="auth-center">
          {step === 'password' && <div className="auth-sub">Двухфакторная защита</div>}

          <div key={step} className={`auth-card ${cardOut ? 'card-out' : 'card-in'}`}>
            {step === 'creds' && (
              <div className="auth-form">
                <input className="auth-input" placeholder="API ID" inputMode="numeric" value={apiId} onChange={(e) => setApiId(e.target.value)} />
                <input className="auth-input" placeholder="API Hash" value={apiHash} onChange={(e) => setApiHash(e.target.value)} />
                <input className="auth-input" placeholder="Телефон" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                {error && <div className="auth-error">{error}</div>}
                <div className="auth-agree" onClick={() => setAgreed((a) => !a)}>
                  <span className={`auth-check ${agreed ? 'on' : ''}`} />
                  <span>
                    Я принимаю{' '}
                    <a href="#" onClick={(e) => e.preventDefault()}>пользовательское соглашение</a>
                  </span>
                </div>
                <button type="button" className="auth-btn" onClick={submitCreds} disabled={loading || !agreed}>
                  {loading ? 'Отправляю…' : 'Продолжить'}
                </button>
                <a className="auth-help" href="https://my.telegram.org" target="_blank" rel="noreferrer">
                  Где взять API ID и Hash? → my.telegram.org
                </a>
              </div>
            )}

            {step === 'code' && (
              <div className="auth-form">
                <CodeInput onChange={setCode} length={5} />
                {error && <div className="auth-error">{error}</div>}
                <button type="button" className="auth-btn" onClick={submitCode} disabled={loading}>
                  {loading ? 'Проверяю…' : 'Войти'}
                </button>
                <button type="button" className="auth-back" onClick={() => goToStep('creds')}>
                  Изменить данные
                </button>
              </div>
            )}

            {step === 'password' && (
              <div className="auth-form">
                <input className="auth-input" type="password" placeholder="Пароль 2FA" value={password} onChange={(e) => setPassword(e.target.value)} />
                {error && <div className="auth-error">{error}</div>}
                <button type="button" className="auth-btn" onClick={submitPassword} disabled={loading}>
                  {loading ? 'Проверяю…' : 'Войти'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* загрузка (по центру) */}
      {step === 'loading' && (
        <div className="auth-onboard">
          <div className="boot-status">{status}</div>
          <div className="boot-bar">
            <div className="boot-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="boot-pct">{progress}%</div>
        </div>
      )}

      {/* результат (по центру) */}
      {step === 'result' && (
        <div className="auth-onboard">
          <div className="boot-counts-text">
            {counts.videos} видео · {counts.photos} фото
          </div>
          <button className="boot-btn" onClick={finish}>
            Смотреть
          </button>
        </div>
      )}
    </div>
  );
}
