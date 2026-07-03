---
obj:
  - IT
tags:
  - AI
  - template
prjfolder: tmpl-b24-php
prjurl: /
ssum: "**Контекст 1го чтения**"
---
# [ШАБЛОН — single-tenant B24 local-app PHP] Новый проект

Скелет single-tenant B24 local-app: PHP-бэк, vanilla JS, файловый store без БД,
защита `<?php exit;?>` без `.htaccess`.

**Tenant-режим зафиксирован:** single-tenant. Multi-tenant (маркет, N порталов одним
деплоем, white-label) — **смена шаблона**, не доработка этого.

---

## КЛОДУ: как начать работу

**Проверь наличие файла `.onboarding-done` в корне проекта:**
- Файла **нет** → онбординг не пройден. Напиши: *"Давай быстро настроим проект — задам 4 вопроса."* Затем открой [docs/onboarding.md](docs/onboarding.md) и следуй протоколу оттуда.
- Файл **есть** → онбординг пройден. Читай раздел «О ПРОЕКТЕ» и работай в рамках проекта.

На команду «стартуем» / «деплой» / любой первый рабочий запрос — если онбординг уже
пройден, **сразу деплою `bash deploy.sh`** и отдаю URL `init.php`. Никаких лишних вопросов.

Параметры собираются **лениво по факту запроса**:
- Юзер просит фичу со `lists.*` / задачами / телефонией → добавляю нужный scope в карточку local-app
- Юзер просит вкладку в карточке сделки / виджет → раскомментирую плейсмент в `www/api/bind.php` + добавляю scope
- Юзер просит фоновую обработку → активирую `www/bin/process.php` через панель cron
- Юзер говорит «cron не нужен» → удаляю `www/bin/process.php`

---

## СТЕК

- **PHP** (>=7.4, проверено на 8.x). Без composer, без фреймворков
- **Vanilla JS + CSS** во фронте, без bundler'а
- **Файловый store** через `<?php exit;?>`-защищённые `.php` файлы в `data/`. БД не нужна
- **B24 OAuth** (local-app), токены в `data/b24-tokens.php`

См. [README.md](README.md) шаблона для полного описания каркаса.

---

## ЖУРНАЛ ПРОЕКТА И КОММИТЫ — ГЛАВНОЕ ПРАВИЛО

Ведём **журнал**, чтобы проект можно было передать другому исполнителю без
потери контекста. Любой, кто откроет проект, должен понять **что делали, где
сейчас и куда идём** — без необходимости читать весь код.

**Память проекта — пять файлов. Точка входа: [docs/handoff.md](docs/handoff.md).**

| Файл | Роль | Как меняется |
|------|------|--------------|
| `docs/handoff.md` | С чего начать новому исполнителю | при передаче |
| `docs/project-brief.md` | Что за проект и зачем | редко |
| `docs/state.md` | Где мы **сейчас** + следующие шаги | постоянно (перезапись) |
| `docs/changelog.md` | Что уже **сделано**, по датам | дописывается вниз |
| `docs/decisions.md` | **Почему** так, а не иначе | дописывается вниз |

**После каждого осмысленного шага:**

1. Обнови `docs/state.md` — где сейчас и что дальше.
2. Допиши `docs/changelog.md` — одна запись про шаг.
3. Был неочевидный выбор? — запись в `docs/decisions.md` (D-NNN).
4. Снимок в git: `bash scripts/snapshot.sh "<что сделали>"`.

Слэш-команды (делают всё это сами):
`/log` — записать шаг и закоммитить · `/decision` — зафиксировать решение ·
`/handoff` — собрать снимок передачи.

«Осмысленный шаг» = добавили фичу, починили баг, задеплоили, приняли решение,
закончили рабочую сессию. Не нужно коммитить каждую строчку.

---

## КАК Я (КЛОД) РАБОТАЮ В ЭТОМ ПРОЕКТЕ

- **Install-flow** уже зашит — двухфазно через `state` + `installFinish` + reload. См. [rule-b24-install-checklist](rules/rule-b24-install-checklist.md)
- **Деплой** — `bash deploy.sh` (локальный rsync `www/` → `/var/www/b24/<slug>/`, slug = имя папки проекта). После деплоя перезагружать Caddy не нужно — PHP-FPM подхватывает файлы сразу.
- **REST-вызовы** — через `$b24 = b24(); $b24->call('method', [...])`. Для CRM сущностей предпочитать `crm.item.*` с `entityTypeId`, не legacy `crm.<entity>.*`. См. [rule-crm-item-universal-api](rules/rule-crm-item-universal-api.md)
- **State** — через `storeRead(FILE)` / `storeWrite(FILE, $data)`. Все state-файлы в `data/`, защищены `<?php exit;?>` префиксом
- **Любые грабли Б24** — сначала `grep` по `rules/INDEX.md`, потом конкретный файл

## Раскладка на сервере — ОДНА папка

Шаблон деплоится **одной папкой** в `/var/www/b24/<slug>/`. Внутри: `index.php`, `env.php`, `api/`, `css/`, `js/` и **`data/` тоже здесь** (store защищён `<?php exit;?>`-префиксом в .php-файлах, веб не достаёт). `deploy.sh` в шаблоне правильный — не переделывать под другую раскладку.

## Caddy + PHP-FPM — следствия для шаблона

Сервер — **VPS с Caddy + PHP-FPM**. Caddy проксирует каждый проект через `uri strip_prefix` и `php_fastcgi`. Что из этого вытекает и УЖЕ учтено в шаблоне:

- **`.htaccess` не используется by design.** Caddy его не читает. Защита state'а — через `<?php exit;?>`-префикс в `.php`-файлах.
- **Handler URL в карточке B24 local-app заканчивается на `/index.php`**, не на `/`. `init.php` печатает правильный URL — копировать оттуда.
- **`template.html`, не `index.html`** — `file_server` в Caddy по умолчанию отдаёт `index.html` как статику раньше PHP. `template.html` этого не триггерит.
- **`data/` с правами `0777`** — PHP-FPM работает от `www-data`, а файлы деплоятся от `deploy`. `deploy.sh` выставляет `chmod 0777` на `data/` автоматически. Содержимое защищено `<?php exit;?>`, не правами ФС.
- **APP_URL в `init.php` определяется неверно** при Caddy `uri strip_prefix`: `SCRIPT_NAME` приходит без префикса пути, и init.php выведет URL без `/<slug>`. Нужно вручную исправить `APP_URL` в `env.php` после запуска init.php. init.php показывает предупреждение об этом.
- **REFERER-fence в session-gate двусторонний** — пропускает и B24-портал, и self-APP_URL. iframe-reload после `BX24.installFinish()` приходит с self-REFERER, без этого мигнёт 403 между установкой и финальной страницей.

---

## О ПРОЕКТЕ

> *Этот раздел заполняется автоматически после онбординга. До онбординга — не трогать.*

**Название:** {{PROJECT_NAME}}
**Описание:** {{PROJECT_DESCRIPTION}}
**Портал Б24:** {{B24_PORTAL}}
**Плейсменты:** {{PLACEMENTS}}
**Cron:** {{CRON}}
**Прод URL:** {{APP_URL}}
**Slug / хостинг:** {{SLUG}} на b24.blackboxbegin.space
**Скоупы Б24:** crm user placement{{EXTRA_SCOPES}}

## ДОКУМЕНТАЦИЯ — ПРОВЕРЯЙ КОГДА ЧТО-ТО НЕ РАБОТАЕТ

Битрикс24 регулярно обновляют API и документацию. Если что-то сломалось или
не идёт — не гадай, иди по цепочке поиска в этом порядке:

1. **`/rules`** — сначала `grep` по [rules/INDEX.md](rules/INDEX.md). Возможно,
   эта грабля уже найдена и описана.
2. **Локальный клон офиц. репозитория** `bitrix-tools/b24-rest-docs`
   (Documentation as Code, ~3490 файлов), уже склонирован на VPS:
   ```bash
   grep -rn "<термин>" /home/deploy/refs/b24-rest-docs --include="*.md"
   ```
   - Папки нет на машине → склонировать:
     `git clone --depth 1 https://github.com/bitrix-tools/b24-rest-docs.git /home/deploy/refs/b24-rest-docs`
   - Подозрение, что данные устарели → `cd /home/deploy/refs/b24-rest-docs && git pull`
3. **MCP `bitrix24-docs`** — поиск прямо из редактора, если в клоне не нашлось.
4. **Online-ссылки** — последний шаг, только если 1–3 не дали ответа:

| Что | Ссылка |
|-----|--------|
| Битрикс24 — OAuth и токены | https://apidocs.bitrix24.ru/settings/oauth/auto-renewal.html |
| Битрикс24 — виджеты CRM | https://apidocs.bitrix24.ru/api-reference/widgets/crm/index.html |
| Битрикс24 — справочник REST API | https://apidocs.bitrix24.ru/api-reference/ |

**Нашёл решение не через `/rules`?** Если грабля вневременная (не специфична
для конкретного клиента/проекта) — оформи файл в `/rules` + строку в
`rules/INDEX.md`, чтобы не искать повторно в следующий раз.

## ИНФРАСТРУКТУРА СЕРВЕРА

VPS с Caddy + PHP-FPM. Все B24-приложения живут на `b24.blackboxbegin.space`.

### Структура на сервере

```
/var/www/b24/
  <slug>/          ← деплой одной папкой
    index.php
    env.php        ← не в git, создаётся через init.php
    api/
    css/
    js/
    template.html
    data/          ← файловый store, не в git
```

### Деплой нового проекта

```bash
bash deploy.sh     # rsync www/ → /var/www/b24/<slug>/
```

`deploy.sh` автоматически: исключает `env.php`, `data/`, `init.php`; выставляет `chmod 0777` на `data/`.

### Caddyfile — паттерн для нового проекта

В `/etc/caddy/Caddyfile` добавить в блок `b24.blackboxbegin.space`:

```
handle /<slug>* {
    uri strip_prefix /<slug>
    root * /var/www/b24/<slug>
    php_fastcgi unix//run/php/php8.3-fpm.sock
    file_server
}
```

После правки перезагрузить (без sudo):
```bash
/usr/bin/caddy reload --config /etc/caddy/Caddyfile
```

### Первый запуск: env.php через init.php

1. `bash deploy.sh`
2. Открыть `https://b24.blackboxbegin.space/<slug>/init.php` в браузере
3. **Вручную исправить `APP_URL`** в `/var/www/b24/<slug>/env.php` —
   init.php запишет `https://b24.blackboxbegin.space` (без `/<slug>`),
   нужно дописать: `https://b24.blackboxbegin.space/<slug>`
4. Вписать `B24_CLIENT_ID` и `B24_CLIENT_SECRET` из карточки local-app в Б24

### Регистрация приложения в Битрикс24

Полная пошаговая инструкция: [how-to-link.md](how-to-link.md)

- Тип: **Серверное** (не Статичное)
- **Путь обработчика:** `https://b24.blackboxbegin.space/<slug>/index.php`
- **Путь установки:** тот же URL (с `/index.php` на конце — обязательно)
- Права: `crm`, `user`, `placement` — минимум для шаблона
