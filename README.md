# `_b24-single-php` — шаблон single-tenant B24 local-app на PHP

Канонический скелет для нового приложения **«один деплой = один портал»**.
PHP-бэкенд, vanilla JS-фронт, файловый store без БД, защита `<?php exit;?>` без `.htaccess`.

Подходит для in-house инструментов, заказных интеграций, одиночных установок.
Для маркета / N-портального деплоя — **смена шаблона** (multi-tenant-вариант
этого шаблона пока не существует), а не доработка этого.

## Что внутри

```
tmpl-b24-php/
├── README.md                 ← этот файл
├── CLAUDE.md                 ← инструкции Клоду: стек, деплой, канон инфраструктуры
├── how-to-link.md            ← пошаговая привязка приложения к порталу Б24
├── .portal-meta.json         ← tenancy=single, owner
├── docs/                     ← журнал проекта (state/changelog/decisions/handoff)
│   └── install-flow-diagram.md  ← диаграмма POST'ов install-flow
├── rules/                    ← КБ граблей Битрикс24 (см. rules/INDEX.md)
├── scripts/
│   └── snapshot.sh           ← коммит-снимок для журнала
└── www/                      ← всё, что деплоится на хостинг
    ├── env.example           ← шаблон env.php
    ├── init.php               ← одноразовый bootstrap нового хостинга
    ├── index.php               ← главный handler (install POST + runtime)
    ├── template.html           ← UI (рендерится через index.php, не веб-сервером напрямую)
    ├── api/
    │   ├── store.php         ← <?php exit;?> защита, storeRead/storeWrite
    │   ├── b24.php            ← B24 class — OAuth, refresh, REST call/batch
    │   ├── session.php         ← admin-only gate через user.admin
    │   ├── install.php         ← alternative install handler (если /index.php занят чем-то)
    │   ├── lib.php              ← settings helpers + httpJson обёртка над cURL
    │   ├── bind.php             ← placement.bind утилита, идемпотентная
    │   └── debug.php            ← REST-тестировщик методов Б24 (удалить когда не нужен)
    ├── bin/
    │   └── process.php       ← CLI cron-воркер (заглушка)
    ├── css/style.css         ← минимальные стили
    └── js/app.js             ← точка входа фронта, BX24 init
```

## Что закрывает «из коробки»

Каждый из этих пунктов взят из живых грабель, см. ссылки на заметки:

| Фаза | Где зашито в коде |
|------|-------------------|
| Save-tokens-gate (`INSTALL=Y` / `ONAPPINSTALL` / `!hasTokens` / expired) | [`index.php`](www/index.php), `api/install.php`. KB: [tokens-save-only-on-install](rules/b24-local-app-tokens-save-only-on-install.md) |
| DOMAIN resolve chain (POST.DOMAIN → existing → REFERER not-self) | `B24::saveTokensFromInstall` в [`api/b24.php`](www/api/b24.php). KB: [marketplace-install-post-no-domain](rules/b24-marketplace-install-post-no-domain.md) |
| `installFinish` маркер | `installFinishedAt` / `installFinishedUsers` в `tokens.json`, рендер `renderInstallFinishPage()` |
| Двухфазная установка | reload через 700ms в `renderInstallFinishPage()`. KB: [two-phase-install](rules/b24-local-app-two-phase-install.md) |
| Защита state через `<?php exit;?>` (без `.htaccess`) | [`api/store.php`](www/api/store.php) |
| Cache-bust `?v=<mtime>` для css/js | `preg_replace_callback` в [`index.php`](www/index.php) |
| Admin-gate через `user.admin` | [`api/session.php`](www/api/session.php) |
| Idempotent `placement.bind` | unbind перед bind в [`api/bind.php`](www/api/bind.php) |
| CRON anti-overlap (flock) | [`bin/process.php`](www/bin/process.php) |
| iframe X-Frame-Options / CSP (опционально) | закомментированный snippet в `index.php` — раскомментировать на коробке клиента |

Полный install-чек-лист и каноны жёстких вопросов: [rules/rule-b24-install-checklist.md](rules/rule-b24-install-checklist.md).

## Как создать новый проект

Деплой, хостинг и первый запуск (`deploy.sh` → `init.php` → регистрация в Б24)
описаны **в одном месте** — [CLAUDE.md → ИНФРАСТРУКТУРА СЕРВЕРА](CLAUDE.md#инфраструктура-сервера).
Пошаговая привязка `client_id`/`client_secret` — в [how-to-link.md](how-to-link.md).
Здесь эти шаги не дублируются, чтобы не разъезжались при изменении флоу — правь только там.

Коротко:

1. Скопировать этот шаблон в новую папку проекта (имя папки = будущий slug).
2. Пройти онбординг: открыть `CLAUDE.md`, если нет `.onboarding-done` — Клод задаст 4 вопроса.
3. Дальше — по [CLAUDE.md → ИНФРАСТРУКТУРА СЕРВЕРА](CLAUDE.md#инфраструктура-сервера).

## Что заменить под конкретный проект

Перед тем как делать бизнес-логику:

1. **`template.html`** — header'ы, title, UI-блоки
2. **`api/bind.php`** — массив `$placements` (раскомментировать нужные)
3. **`bin/process.php` → `runJob()`** — тело cron-задачи (если нужна)
4. **Новые endpoint'ы в `api/`** — свои `<endpoint>.php` под бизнес-операции
5. **`CLAUDE.md`** — пройти онбординг для конкретного проекта (заменит шаблонный текст)

## Что НЕ менять без причины

- **`api/store.php`** — защита через `<?php exit;?>` критична. Не выносить state в обычный `.json`
- **`api/b24.php` `saveTokensFromInstall`** — там цепочка резолва DOMAIN и not-self фильтр. Любая правка может сломать установку на cloud / коробке
- **`api/session.php`** — admin-gate через `user.admin` REST. Не ослаблять до простого «есть ли AUTH_ID»
- **Save-policy токенов в `index.php`** — `$isFirst || $isFormal || expired`. Не сохранять на каждом POST'е, иначе admin-токен затрётся (см. заметку)

## Хостинг

Канон — [CLAUDE.md → ИНФРАСТРУКТУРА СЕРВЕРА](CLAUDE.md#инфраструктура-сервера)
(сейчас: VPS с Caddy + PHP-FPM, домен `b24.blackboxbegin.space`, все проекты
шаблона деплоятся туда). Домен, а не IP — переезд VPS к другому хостеру с тем
же доменом ничего в шаблоне не меняет.

`deploy.sh` сейчас заточен именно под этот VPS (локальный rsync, `uri strip_prefix`
в Caddy). Деплой на сервер заказчика с другим доменом/веб-сервером — другая
топология (может понадобиться SSH вместо локального rsync, другой веб-сервер
вместо Caddy) — адаптировать `deploy.sh` точечно, когда такой кейс появится,
не раньше.
