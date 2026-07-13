---
obj:
  - IT
tags:
  - AI
  - template
prjfolder: tmpl-b24-php
prjurl: /docs/
ssum: Состояние проекта — где мы сейчас. Живой снимок. Этот файл всегда отражает текущее положение дел.
---
# Состояние проекта — где мы сейчас

> **Живой снимок.** Этот файл всегда отражает текущее положение дел.
> Его не дописывают вниз, а **перезаписывают** — здесь только «сейчас»,
> вся история — в [changelog.md](./changelog.md).
> Обновляй после каждого осмысленного шага и **коммить**.

**Последнее обновление:** 2026-07-13
**Фаза:** Бэкенд пульта готов и проверен на живых данных, дальше — UI

---

## Где мы сейчас

Онбординг завершён, дизайн-спека главной страницы утверждена:
[docs/superpowers/specs/2026-07-13-pult-rukovoditelya-design.md](superpowers/specs/2026-07-13-pult-rukovoditelya-design.md)
(вариант B — таблица сделок + KPI-плашки сверху + аккордеон
Сделка→Этап→Модуль, см. D-004 в decisions.md). Это «Пульт руководителя» —
отдельная страница (LEFT_MENU) для директора и замов портала
`alfa-prj.bitrix24.ru`: сводка по всем объектам компании (иерархия
смарт-процессов Сделка (1050) → Этап/Milestone (1054) → Модуль (1062),
плюс Оплаты (1058)) — сроки и ключевые показатели без погружения в детали
конкретной сделки. Бизнес-контекст полей, стадий и связей между смартами —
в `/source` (5 файлов: Deal, Milestone, Module, Pay, Задачи).

Инфраструктура полностью готова: деплой на VPS `rub24.blackboxbegin.space`
(см. D-005), local-app в Б24 перерегистрирован на этот домен, install-flow
пройден — токены сохранены в `data/b24-tokens.php` на сервере (`domain:
alfa-prj.bitrix24.ru`).

Бэкенд пульта реализован и проверен реальными REST-вызовами:
`www/api/dashboard-data.php` (`fetchDashboardData()`) собирает дерево
сделка→этапы→модули с агрегатами/индикаторами через batch-загрузку
`crm.item.list` по 4 сущностям (Deal/Milestone/Module/Pay, см. D-006),
`www/api/dashboard.php` — тонкий session-gated эндпоинт с `?filter=active|all|closed`.
По ходу реализации найдена и задокументирована грабля Б24
(`rules/rule-crm-item-camelcase-select.md`): `select`/ответ `crm.item.list`
— camelCase-имена полей, не классические коды из `/source`.

UI (`www/js/app.js` + `www/template.html`) — ещё не написан.

## Сейчас в работе

—

## Следующие шаги

- [ ] UI: KPI-плашки, таблица сделок, фильтры (поиск/стадии/пресеты),
      сортировка, аккордеон Сделка→Этап→Модуль — `www/js/app.js` +
      `www/template.html`, по JSON-контракту `dashboard.php`
      (см. `www/api/dashboard-data.php` — формы `deals[]`/`kpi`)
- [ ] После UI — открыть приложение в Б24 и проверить весь путь глазами
      (не только API-ответ)

## Открытые вопросы / блокеры

—

## Карта проекта

| Что | Где |
|-----|-----|
| Точка входа (handler) | `www/index.php` |
| OAuth, токены | `www/api/b24.php` |
| Файловый store | `www/api/store.php` |
| Плейсменты | `www/api/bind.php` |
| Admin-gate | `www/api/session.php` |
| Данные пульта (агрегация) | `www/api/dashboard-data.php` |
| Эндпоинт пульта | `www/api/dashboard.php` |
| UI-шаблон | `www/template.html` |
| JS-фронтенд | `www/js/app.js` |
| Install-flow диаграмма | `docs/install-flow-diagram.md` |
| Бизнес-контекст (смарты Б24) | `/source` |
| Прод URL | https://rub24.blackboxbegin.space/ap-pdir/ |
| Хостинг / slug | VPS rub24.blackboxbegin.space (45.91.55.178), slug: ap-pdir, деплой по SSH — см. D-005 |
