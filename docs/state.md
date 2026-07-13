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
**Фаза:** Приложение установлено на rub24, старт реализации `dashboard.php`

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
пройден — `installFinishedAt`/токены сохранены в `data/b24-tokens.php` на
сервере (`domain: alfa-prj.bitrix24.ru`, `installFinishedUsers: [1]`).
`api/debug.php` доступен для REST-проверок с живого портала.

Код приложения (эндпоинт `www/api/dashboard.php`, UI) ещё не написан —
только каркас шаблона + утверждённая спека.

## Сейчас в работе

Реализация `fetchDashboardData()` / `dashboard.php` по TDD (b24-tdd) —
следующий шаг после этой записи.

## Следующие шаги

- [ ] Реализовать `fetchDashboardData()` (новый файл под `www/api/`, не в
      generic `lib.php` — см. комментарий в шапке `lib.php` про
      бизнес-специфичные функции): batch-загрузка `crm.item.list`
      (entityTypeId 1050/1054/1062) + серверная агрегация дерева
      сделка→этапы→модули с индикаторами — см. спеку и
      `rules/rule-b24-rest-batch-not-loop.md`
- [ ] Эндпоинт `www/api/dashboard.php`, отдающий готовое дерево одним JSON
- [ ] UI: KPI-плашки, таблица сделок, фильтры/сортировка, аккордеон —
      `www/js/app.js` + `www/template.html`, по контракту из спеки

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
| UI-шаблон | `www/template.html` |
| JS-фронтенд | `www/js/app.js` |
| Install-flow диаграмма | `docs/install-flow-diagram.md` |
| Бизнес-контекст (смарты Б24) | `/source` |
| Прод URL | https://rub24.blackboxbegin.space/ap-pdir/ |
| Хостинг / slug | VPS rub24.blackboxbegin.space (45.91.55.178), slug: ap-pdir, деплой по SSH — см. D-005 |
