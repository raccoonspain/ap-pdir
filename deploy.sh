#!/usr/bin/env bash
# Деплой single-tenant B24 local-app.
# Синхронизирует www/ → /var/www/b24/<slug>/
# data/, init.php — не трогает (стор; init.php — bootstrap для 1%-кейса
# другого хостинга, см. how-to-link-ALL.md).
#
# Slug = имя папки проекта. При первом деплое (env.php на сервере ещё нет)
# скрипт сам генерирует env.php из www/env.example: APP_URL/APP_PATH/DATA_ROOT
# детерминированы этим конвентом (VPS+Caddy, домен фиксирован b24.blackboxbegin.space),
# автоопределять их незачем. Остаётся вписать B24_CLIENT_ID/SECRET после
# регистрации приложения в Б24 — см. how-to-link.md.

# Настройки безопасности скрипта:
# `-e` — остановиться при первой же ошибке (ненулевой код возврата команды)
# `-u` — падать, если используется необъявленная переменная
# `-o  pipefail` — если в конвейере (cmd1 | cmd2) упала любая команда, весь конвейер считается упавшим
set -euo pipefail

# Переходит в директорию, где лежит сам скрипт ($0) 
# чтобы дальнейшие относительные пути (www/) работали независимо от того, откуда скрипт запустили.
cd "$(dirname "$0")"

# Берёт имя текущей папки (после cd это папка проекта) — это и есть slug
SLUG="$(basename "$(pwd)")"

# Safety: slug должен быть простым идентификатором.
if ! [[ "$SLUG" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "Ошибка: slug '${SLUG}' содержит недопустимые символы. Только [a-zA-Z0-9_-]." >&2
  exit 1
fi

# Формирует путь назначения на сервере и создаёт его, если ещё нет
# `-p` — не ругаться, если уже существует, и создать промежуточные папки
DEPLOY_DIR="/var/www/b24/${SLUG}"
mkdir -p "$DEPLOY_DIR"

# Проверяет, есть ли rsync в системе. Если есть — синхронизирует папку www/ в DEPLOY_DIR:
# `-a` (archive) — сохранять права, симлинки, время модификации, рекурсивно
# `-v` — подробный вывод
# `-z` — сжатие при передаче (полезно для сети, для локального rsync погоды не делает)
# `--delete` — удалять на сервере файлы, которых больше нет в www/ (чтобы не копились мусорные старые файлы)
# `--exclude` — не трогать env.php (прод-конфиг — генерируется отдельно ниже, если его ещё нет),
#               data/ (стор с рантайм-данными), init.php (bootstrap для 1%-кейса другого хостинга), .git/, файлы *.example

# else
# Фолбэк, если rsync не установлен: обычное копирование через cp -a, а затем ручное удаление env.php/init.php
# (это менее аккуратно — data/ тут не исключается при копировании и не удаляется,
# и --delete-семантики нет — старые файлы на сервере не подчистятся).

if command -v rsync &>/dev/null; then
  rsync -avz --delete \
    --exclude 'env.php' \
    --exclude 'data/' \
    --exclude 'init.php' \
    --exclude '.git/' \
    --exclude '*.example' \
    www/ "$DEPLOY_DIR/"
else
  cp -a www/. "$DEPLOY_DIR/"
  rm -f "$DEPLOY_DIR/env.php" "$DEPLOY_DIR/init.php"
fi

# Первый деплой этого slug'а: env.php на сервере ещё нет.
# APP_URL/APP_PATH/DATA_ROOT детерминированы конвентом (домен фиксирован,
# путь = DEPLOY_DIR) — генерируем env.php из env.example без ручного шага.
# B24_CLIENT_ID/SECRET оставляем как в env.example — их можно узнать только
# из карточки local-app в Б24, вписываются вручную после регистрации.
if [ ! -f "$DEPLOY_DIR/env.php" ]; then
  APP_URL="https://b24.blackboxbegin.space/${SLUG}"
  sed -E \
    -e "s#(define\\('APP_URL',[[:space:]]*)''#\\1'${APP_URL}'#" \
    -e "s#(define\\('APP_PATH',[[:space:]]*)''#\\1'${DEPLOY_DIR}'#" \
    -e "s#(define\\('DATA_ROOT',[[:space:]]*)''#\\1'${DEPLOY_DIR}/data'#" \
    www/env.example > "$DEPLOY_DIR/env.php"
  chmod 0600 "$DEPLOY_DIR/env.php"
  ENV_JUST_CREATED=1
else
  ENV_JUST_CREATED=0
fi

# data/ должна быть доступна для записи PHP-FPM (www-data).
# Содержимое защищено <?php exit;?>, не правами ФС.
mkdir -p "$DEPLOY_DIR/data"
chmod 0777 "$DEPLOY_DIR/data"

echo "✓ Деплой завершён: https://b24.blackboxbegin.space/${SLUG}/"
if [ "$ENV_JUST_CREATED" = "1" ]; then
  echo "  env.php создан автоматически (APP_URL/APP_PATH/DATA_ROOT уже верные)."
  echo "  Осталось: зарегистрировать local-app в Б24 (см. how-to-link.md) и"
  echo "  вписать B24_CLIENT_ID/B24_CLIENT_SECRET в ${DEPLOY_DIR}/env.php"
fi
