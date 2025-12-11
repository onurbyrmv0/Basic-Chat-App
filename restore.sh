#!/bin/bash

# Check if filename argument is provided
if [ -z "$1" ]; then
  echo "❌ Error: Please provide the backup filename."
  echo "Usage: ./restore.sh <filename>"
  echo "Example: ./restore.sh mongo_backup_20251211_130000.archive"
  exit 1
fi

BACKUP_FILE="./backups/$1"

# Check if file exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: File '$BACKUP_FILE' not found!"
  exit 1
fi

echo "⚠️  Restoring from '$1'..."
echo "⚠️  WARNING: This will overwrite the current database!"
read -p "Are you sure? (y/N) " confirm

if [[ $confirm != [yY] && $confirm != [yY][eE][sS] ]]; then
  echo "Restore cancelled."
  exit 0
fi

# Run mongorestore via piping
# We use -i (interactive) to accept stdin
cat "$BACKUP_FILE" | docker exec -i chat-mongo sh -c 'mongorestore --archive --drop'

if [ $? -eq 0 ]; then
  echo "✅ Restore successful!"
else
  echo "❌ Restore failed!"
fi
