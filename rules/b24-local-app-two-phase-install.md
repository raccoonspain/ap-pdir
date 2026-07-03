# Двухфазная установка (installFinish + reload)

## Проблема

`index.php` — один URL на install-путь и на runtime. Первый POST от Б24 приносит
`AUTH_ID`/`REFRESH_ID` — токены нужно сохранить. Но пока `BX24.installFinish()`
не вызван, портал считает приложение не настроенным (`INSTALLED: false`), и
рендерить сразу основной интерфейс бессмысленно — Б24 всё равно не признает
установку завершённой.

## Решение в шаблоне

`renderInstallFinishPage()` в `www/api/b24.php`:
1. Показывает промежуточную страницу с подключённым `//api.bitrix24.com/api/v1/`.
2. `BX24.init(() => { BX24.installFinish(); setTimeout(() => location.reload(), 700); })`.
3. Через 700мс — `location.reload()`. Браузер шлёт **новый** POST на тот же URL
   (open #2), но теперь `installFinish` уже отработал → `needsInstallFinishFor()`
   вернёт `false` → рендерится обычный `template.html`.

## Почему не сразу рендерить UI на первом POST

`installFinish()` — асинхронный вызов к Б24 (`BX24.init` callback). Если рендерить
`template.html` сразу и вызывать `installFinish()` внутри него без reload —
работает нестабильно: часть логики фронтенда (`js/app.js`) может выполниться
раньше, чем портал получит сигнал завершения установки, и часть REST-вызовов
из под ещё не завершённой установки может некорректно себя вести (плейсменты
не отрисуются, см. [rule-b24-install-checklist](rule-b24-install-checklist.md)).
Явный reload — самый надёжный способ гарантировать чистое состояние.
