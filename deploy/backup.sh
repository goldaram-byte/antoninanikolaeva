#!/bin/bash
# ============================================================================
# Ночной автобэкап базы данных CRM «Школа каратэ Николаевой Антонины».
# Хранит сжатые копии 14 дней в /opt/karate/backups.
#
# Установка (один раз, под root):
#   chmod +x /opt/karate/deploy/backup.sh
#   crontab -e     → добавить строку:
#   0 3 * * * /opt/karate/deploy/backup.sh >> /var/log/karate-backup.log 2>&1
#
# Проверка вручную: /opt/karate/deploy/backup.sh
# Восстановление из копии описано в УСТАНОВКА_НА_СЕРВЕР.md.
# ============================================================================
set -u

DB_NAME="karate"
BACKUP_DIR="/opt/karate/backups"
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%F_%H-%M)
FILE="$BACKUP_DIR/${DB_NAME}_${STAMP}.sql.gz"

if sudo -u postgres pg_dump "$DB_NAME" | gzip > "$FILE"; then
  echo "$(date '+%F %T') ✓ бэкап создан: $FILE ($(du -h "$FILE" | cut -f1))"
else
  echo "$(date '+%F %T') ✗ ОШИБКА бэкапа!"
  exit 1
fi

# Удаляем копии старше KEEP_DAYS дней
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +$KEEP_DAYS -delete
