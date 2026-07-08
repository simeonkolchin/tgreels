import { useEffect, useState } from 'react';
import {
  authCode,
  authLogin,
  authLoginCode,
  authPassword,
  authRegister,
  authStart,
  checkUsername,
  reindexFeed,
} from '../api';
import CodeInput from './CodeInput';

interface MediaItem {
  video: boolean;
  url: string;
  poster?: string;
}

type Step =
  | 'choice'
  | 'creds'
  | 'code'
  | 'password'
  | 'account'
  | 'login'
  | 'login-code'
  | 'loading'
  | 'result';

const UNAME_RE = /^[a-z0-9_]{3,20}$/;

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
  const [step, setStep] = useState<Step>('choice');
  const [cardOut, setCardOut] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  // регистрация: логин/пароль приложения
  const [username, setUsername] = useState('');
  const [regPass, setRegPass] = useState('');
  const [unameOk, setUnameOk] = useState<boolean | null>(null);
  // вход
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
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

  // проверка доступности логина (регистрация) с дебаунсом
  useEffect(() => {
    if (step !== 'account') return;
    const u = username.trim().toLowerCase();
    if (!UNAME_RE.test(u)) {
      setUnameOk(null);
      return;
    }
    let alive = true;
    const t = window.setTimeout(async () => {
      const ok = await checkUsername(u);
      if (alive) setUnameOk(ok);
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [username, step]);

  // после успешного входа: панель уезжает вниз → загрузка по центру (фон на месте)
  const goToLoading = () => {
    setCardOut(true);
    window.setTimeout(() => {
      setStep('loading');
      runOnboard();
    }, 600);
  };

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

  const finish = () => {
    setFinishing(true);
    window.setTimeout(onDone, 780);
  };

  // ── регистрация ──
  const submitCreds = async () => {
    setError(null);
    if (!apiId.trim() || !apiHash.trim() || !phone.trim()) return setError('Заполни все поля');
    setLoading(true);
    const r = await authStart(Number(apiId.trim()), apiHash, phone);
    setLoading(false);
    if (!r.ok) return setError(r.error || 'Не удалось отправить код');
    setCode('');
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
    if (r.step === 'account') {
      setUsername(r.username || '');
      return goToStep('account');
    }
    if (r.step === 'done') goToLoading(); // тест-режим
  };

  const submitPassword = async () => {
    setError(null);
    if (!password) return setError('Введи пароль');
    setLoading(true);
    const r = await authPassword(password);
    setLoading(false);
    if (!r.ok) return setError(r.error || 'Неверный пароль');
    if (r.step === 'account') {
      setUsername(r.username || '');
      return goToStep('account');
    }
    if (r.step === 'done') goToLoading();
  };

  const submitAccount = async () => {
    setError(null);
    const u = username.trim().toLowerCase();
    if (!UNAME_RE.test(u)) return setError('Логин: 3–20 символов, латиница/цифры/_');
    if (unameOk === false) return setError('Такой логин уже занят');
    if (regPass.length < 4) return setError('Пароль минимум 4 символа');
    setLoading(true);
    const r = await authRegister(u, regPass);
    setLoading(false);
    if (!r.ok) return setError(r.error || 'Не удалось зарегистрироваться');
    goToLoading();
  };

  // ── вход ──
  const submitLogin = async () => {
    setError(null);
    if (!loginUser.trim() || !loginPass) return setError('Введи логин и пароль');
    setLoading(true);
    const r = await authLogin(loginUser.trim().toLowerCase(), loginPass);
    setLoading(false);
    if (!r.ok) return setError(r.error || 'Не удалось войти');
    setCode('');
    goToStep('login-code');
  };

  const submitLoginCode = async () => {
    setError(null);
    if (!code.trim()) return setError('Введи код');
    setLoading(true);
    const r = await authLoginCode(code);
    setLoading(false);
    if (!r.ok) return setError(r.error || 'Неверный код');
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

  const sub =
    step === 'password'
      ? 'Двухфакторная защита'
      : step === 'account'
        ? 'Придумайте логин и пароль'
        : step === 'login'
          ? 'С возвращением'
          : step === 'login-code'
            ? 'Код отправлен в «Избранное» Telegram'
            : null;

  const isForm = step !== 'loading' && step !== 'result';

  return (
    <div className={`auth ${finishing ? 'finishing' : ''}`}>
      <div className="auth-bg">
        <span className="blob b1" />
        <img className="bg-r" src="/r-glass.png" alt="" />
      </div>
      <span className="blob b2" />

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

      {isForm && (
        <div className="auth-center">
          {sub && <div className="auth-sub">{sub}</div>}

          <div key={step} className={`auth-card ${cardOut ? 'card-out' : 'card-in'}`}>
            {step === 'choice' && (
              <div className="auth-form">
                <div className="auth-choice">
                  <button type="button" className="auth-btn" onClick={() => goToStep('login')}>
                    Войти
                  </button>
                  <button
                    type="button"
                    className="auth-btn auth-btn-ghost"
                    onClick={() => goToStep('creds')}
                  >
                    Регистрация
                  </button>
                </div>
              </div>
            )}

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
                <button type="button" className="auth-back" onClick={() => goToStep('choice')}>
                  Назад
                </button>
              </div>
            )}

            {step === 'code' && (
              <div className="auth-form">
                <CodeInput key="reg-code" onChange={setCode} length={5} />
                {error && <div className="auth-error">{error}</div>}
                <button type="button" className="auth-btn" onClick={submitCode} disabled={loading}>
                  {loading ? 'Проверяю…' : 'Далее'}
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
                  {loading ? 'Проверяю…' : 'Далее'}
                </button>
              </div>
            )}

            {step === 'account' && (
              <div className="auth-form">
                <div className="auth-uname">
                  <input
                    className="auth-input"
                    placeholder="Логин"
                    autoCapitalize="none"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                  />
                  {UNAME_RE.test(username.trim().toLowerCase()) && unameOk !== null && (
                    <span className={`uname-mark ${unameOk ? 'ok' : 'bad'}`}>{unameOk ? '✓' : '✕'}</span>
                  )}
                </div>
                <input className="auth-input" type="password" placeholder="Пароль" value={regPass} onChange={(e) => setRegPass(e.target.value)} />
                {error && <div className="auth-error">{error}</div>}
                <button type="button" className="auth-btn" onClick={submitAccount} disabled={loading || unameOk === false}>
                  {loading ? 'Создаю…' : 'Создать аккаунт'}
                </button>
              </div>
            )}

            {step === 'login' && (
              <div className="auth-form">
                <input className="auth-input" placeholder="Логин" autoCapitalize="none" value={loginUser} onChange={(e) => setLoginUser(e.target.value.replace(/\s/g, ''))} />
                <input className="auth-input" type="password" placeholder="Пароль" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} />
                {error && <div className="auth-error">{error}</div>}
                <button type="button" className="auth-btn" onClick={submitLogin} disabled={loading}>
                  {loading ? 'Проверяю…' : 'Войти'}
                </button>
                <button type="button" className="auth-back" onClick={() => goToStep('choice')}>
                  Назад
                </button>
              </div>
            )}

            {step === 'login-code' && (
              <div className="auth-form">
                <CodeInput key="login-code" onChange={setCode} length={5} />
                {error && <div className="auth-error">{error}</div>}
                <button type="button" className="auth-btn" onClick={submitLoginCode} disabled={loading}>
                  {loading ? 'Проверяю…' : 'Войти'}
                </button>
                <button type="button" className="auth-back" onClick={() => goToStep('login')}>
                  Назад
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 'loading' && (
        <div className="auth-onboard">
          <div className="boot-status">{status}</div>
          <div className="boot-bar">
            <div className="boot-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="boot-pct">{progress}%</div>
        </div>
      )}

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
