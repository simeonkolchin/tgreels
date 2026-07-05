# Vertical Videos (Telegram → Reels) — рабочая дока

Тонкий прокси-стрим: видео живут в Telegram-каналах, сервер только ретранслирует байты
кусками (Range), на диск ничего не пишет. БД хранит только id сообщений + метаданные.

СТЕК: backend = Python (Telethon + FastAPI), frontend = React + TypeScript (Vite).

## Архитектура
- `backend/app/config.py` — чтение .env
- `backend/app/telegram/` — Telethon клиент + media-хелперы + streamer (Range)
- `backend/app/db/` — sqlite: каналы, видео, сид-шафл ленты
- `backend/app/parser/indexer.py` — индексатор (первый полный проход + инкремент min_id)
- `backend/app/routes/` — `/stream/:id` (206), `/thumb/:id`, `/api/feed`
- `backend/app/scheduler.py` — переиндексация раз в N часов
- `backend/app/main.py` — FastAPI + lifespan
- `backend/scripts/login.py` — интерактивная авторизация → data/session
- `frontend/src/` — React+TS reels (ReelsFeed + ReelItem, IntersectionObserver, adaptive)

## Чеклист — ВСЁ ГОТОВО ✅
- [x] backend config + requirements + .env.example
- [x] telegram/client.py (файловая сессия, flood-sleep)
- [x] telegram/media.py (peer, video_attr, doc helpers)
- [x] telegram/streamer.py (resolve+кэш, Range-генератор, выравнивание 4096)
- [x] db/database.py + db/repo.py (схема, запросы, сид-шафл mulberry32)
- [x] parser/indexer.py (dialogs → каналы → видео, full + min_id инкремент)
- [x] routes stream / thumb / feed
- [x] scheduler.py (interval + первый запуск если пусто) + main.py lifespan
- [x] scripts/login.py + scripts/reindex.py
- [x] frontend: Vite+React+TS, api/types, ReelsFeed, ReelItem, styles (adaptive)
- [x] Docker: backend Dockerfile, frontend Dockerfile+nginx, docker-compose
- [x] README.md
- [x] py_compile прошёл; media_type-дублирование в stream убрано

## Оптимизация скорости (итерация 2) — ГОТОВО ✅
Проблема: долгая загрузка. Причины и фиксы:
- [x] Убрать get_messages с горячего пути: локатор (doc_id/access_hash/
      file_reference/dc_id) хранится в БД, стрим напрямую; get_messages только на
      FILE_REFERENCE_EXPIRED, потом бэкфилл в БД (update_doc_locator).
- [x] cryptg в requirements (нативный AES). Нужен docker compose build.
- [x] request_size 512КБ → 1МБ.
- [x] Cache-Control public max-age на /stream.
- [x] Фронт: префетч соседей ±2.
- Миграция старых БД: колонки добавляются через _migrate(); у видео, проиндексиро-
  ванных до апдейта, локатор пустой → бэкфилл при первом просмотре, дальше быстро.
- ОСТАЁТСЯ вне нашего контроля: если mp4 без faststart (moov в конце) — первый старт
  тянет хвост. Лечится только ре-муксом при заливке ролика (-movflags +faststart).

## Итерация 3: парсер отдельным контейнером — ГОТОВО ✅
Индексация в своём процессе, не влияет на раздачу, пишет в общую БД, сам крутится 12ч.
- [x] worker.py — asyncio-loop: index_all → sleep(interval); если БД уже наполнена
      (ручной первый прогон) — первый авто-проход через интервал, без дубля
- [x] API (main.py) больше не индексирует — scheduler убран
- [x] ОТДЕЛЬНЫЕ Telethon-сессии: api (/data/session/api) и worker (/data/session/worker)
      → задаётся в compose через SESSION_PATH per-service; логин дважды
- [x] Кэш ленты: инвалидация по сигнатуре БД (count,max_id) — API видит вставки воркера
- [x] sqlite: PRAGMA busy_timeout=5000 (WAL уже был)
- [x] compose: сервис worker (тот же образ, command=worker.py, свой SESSION_PATH)
- [x] apscheduler убран, scheduler.py удалён
- [x] Порядок запуска: build → run worker reindex (разово, наполнить) → up -d

ВАЖНО про сессии: api и worker НИКОГДА не делят одну сессию (у каждого своя, отдельный
логин = отдельный auth key). Поэтому параллельная работа безопасна. Ручной первый
прогон делается ДО `up`, пока долгоживущий worker не запущен — его сессия
используется строго последовательно.

## Итерация 4: фиксы плеера — ГОТОВО ✅
- [x] Стартовал на паузе: React не успевал проставить атрибут muted до play() →
      автоплей блокировался. Теперь muted ставится императивно через ref ДО play(),
      + autoPlay={active}. Убран onPause-хендлер (плодил ложную паузу).
- [x] Не листалось по концу: был атрибут loop (event ended не наступал). Убрал loop,
      добавил onEnded → ReelsFeed.goTo(idx+1) (scrollIntoView smooth).

## Итерация 5: диагностика «ничего не грузится» — ГОТОВО ✅
Что было сломано и как починено:
- api.session НЕ была авторизована → backend падал AuthKeyUnregisteredError.
  Fix: backend указан на живую userbot-сессию (SESSION_PATH в compose).
- КЛЮЧЕВОЕ: access_hash каналов и file_reference документов СЕССИЯ-СПЕЦИФИЧНЫ.
  Локатор, записанный воркером, backend'ом (другая сессия) использовать нельзя →
  ChannelInvalidError. Fix: backend резолвит канал сам через get_input_entity по
  стабильному channel_id + прогрев entity-кэша get_dialogs() при старте; свежий
  file_reference берёт своей сессией; кэш документов в памяти (5 мин), а не в БД.
  → колонки локатора в БД для backend больше не используются (не мешают).
- Starlette этой версии принимает только bytes, Telethon отдаёт memoryview →
  AttributeError 'memoryview'.encode. Fix: yield bytes(chunk).
- nginx кешировал IP backend при старте → 502 после каждого пересоздания backend.
  Fix: resolver 127.0.0.11 + переменная $backend (рантайм-резолв).
Замеры после фикса: TTFB ~0.08–0.2с (холодный), ~3мс (тёплый), 1МБ ~0.4с. id=4 faststart.

## Итерация 6: редизайн под Instagram — ГОТОВО ✅
Backend:
- channels.photo BLOB (миграция) + скачивание аватарки в indexer (download_profile_photo,
  один раз если нет) + роут /channel/{id}/photo.
- feed отдаёт channelId, username, messageId, channelPhotoUrl, postUrl (t.me/{user}/{msg}
  только для публичных каналов).
- nginx: добавлен location /channel (без него аватарки уходили в SPA).
Frontend:
- icons.tsx (back/search/heart/comment/share-самолётик/volume/play/music).
- TopBar (назад+поиск, косметика). Правый рельс: лайк (розовый #ff2d6f + glow, без
  счётчика, без логики), коммент (без логики), share (navigator.share/tg share, только
  если есть postUrl), аудио-диск с аватаркой (крутится при плее).
- Инфо канала: аватар + имя строчными + follow (косметический тоггл).
- Описание: 2 строки + «ещё/свернуть», видео не прерывается.
- Тонкий прогресс-бар (2.5px). Тап по видео → пауза; в паузе play + над ним кнопка звука.
- Звук ВКЛ по умолчанию (soundOn=true); при блокировке автоплея — muted-фолбэк,
  снимается первым тапом/кнопкой звука (честное состояние через onVolumeChange).
- default-avatar.svg (заменяемая заглушка) подставляется через onError.
ВАЖНО: все каналы юзера ПРИВАТНЫЕ (username=null) → share-ссылки t.me нет, кнопка ничего
не делает. Заработает для публичных каналов.

## Итерация 7: очистка отписок + пустое состояние — ГОТОВО ✅
- indexer.sync_channels собирает keep_ids подписанных каналов и вызывает
  repo.prune_channels(keep) → удаляет каналы, которых нет в подписках, ВМЕСТЕ с их
  видео. Проверка только на уровне канала (посты не трогаем). keep пуст → чистим всё.
- Идемпотентность проверена: повторный реиндекс удаляет 0.
- Фид auto-инвалидирует кэш по сигнатуре (count,max_id) → удаления видны сразу.
- Frontend: состояние loaded → отличаем «идёт загрузка» от «БД пуста» (🎬 Пока пусто).
- ФАКТ теста: подписки юзера сменились — старые 4 приватных Fansly-канала удалены,
  остался 1 ПУБЛИЧНЫЙ «ДО ВСТРЕЧИ В ГОРАХ» (@AndreyBeilman, 113 видео) → share теперь
  реально работает (есть t.me ссылка), аватарка есть.

## Итерация 8: главная страница (фото-лента, X-стиль) + навигация — ГОТОВО ✅
Backend:
- Таблица `photos` (миграция): id, channel_id, message_id, post_key (grouped_id альбома
  или m<msg>), caption, date. Фото НЕ храним — проксируем.
- indexer: ловит msg.photo, группирует альбомы по grouped_id. prune чистит и фото.
- repo: сборка постов (группировка по post_key, до 5 фото, подпись из первого непустого),
  сид-шафл постов, /api/photos.
- /photo/{id}: резолвит сообщение своей сессией, качает размер 'x' (~800px), отдаёт jpeg;
  LRU-кэш байтов в ПАМЯТИ (64 МБ), не на диске. nginx: добавлен location /photo.
- scripts/rescan.py: сброс курсоров + полный проход (наполнить фото задним числом).
  Запуск: stop worker → run worker rescan.py → start worker. (dev: 576 фото, 135 постов)
Frontend:
- App — роутер по Page (reels|home|search|notifications|messages), старт на reels.
- ReelsPage вынесен из App (рилсы НЕ менялись). Стрелка ← в рилсах → главная.
- HomePage: X-топбар (аккаунт слева, буква R по центру, +человек справа) + фото-лента
  с бесконечной прокруткой (сентинел + IntersectionObserver).
- PostCard (X-стиль: аватар+имя+@+текст) + Collage (раскладки n1..n5, до 5 фото).
- BottomNav: главная / поиск / рилсы(центр) / уведомления / сообщения.
- StubPage «в разработке» для search/notifications/messages.
- Иконки: Home/Bell/Mail/ReelsNav/Account/PersonPlus (SVG), R-лого текстом.

## Возможные доработки (если понадобится)
- лайки/шеры, звук-по-умолчанию, аналитика просмотров
- Redis-кэш горячих чанков при высоком трафике
- бэкенд-логин api-сессии, если решишь не переиспользовать userbot

## Заметки / решения
- fileReference протухает → на каждый стрим ре-резолвим сообщение (getMessages),
  результат кэшируем на 60с (config.docCacheTtlMs), т.к. плеер шлёт много Range-запросов.
- offset выравниваем вниз до 4096, лишние байты в первом чанке отрезаем.
- Лента: mulberry32(seed) + Fisher-Yates по всем id → стабильная бесконечная прокрутка
  в рамках сессии (seed генерит фронт один раз).
- Превью качаем при индексации и кладём BLOB в sqlite → мгновенный poster без обращения в TG.
- Каналы: id и access_hash храним строками; InputPeerChannel строим из них (переживает рестарт).
