#!/usr/bin/env bash
# Encrypted database backup (BUILD F-12, FR-33, FR-34, D14): three `supabase db dump` passes
# (roles, schema, data; the data dump includes the auth schema), packed and encrypted with `age`
# to the public recipient. The private key never comes near this script; plaintext never leaves
# the temporary directory, which is removed on exit.
#   SUPABASE_DB_URL=… BACKUP_AGE_RECIPIENT=age1… [OUT_DIR=…] scripts/backup.sh
set -euo pipefail
umask 077

: "${SUPABASE_DB_URL:?set SUPABASE_DB_URL (the session pooler URL, a GitHub secret)}"
: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT (the age public key, a repo variable)}"
command -v age >/dev/null || { echo "backup: age isn't installed" >&2; exit 1; }

out_dir=$(cd "${OUT_DIR:-.}" && pwd)
out="$out_dir/backup-$(date -u +%F).tar.gz.age"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"

npx supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f roles.sql
# Drop Supabase-managed grants (GRANT SET/ALTER SYSTEM ON PARAMETER … TO "supabase_…"): only supabase_admin can
# make them, so they fail a restore as postgres, and every new project already has them.
# An app's own parameter grants stay in the backup.
sed -i '/^GRANT .* ON PARAMETER .* TO "supabase_/d' roles.sql
npx supabase db dump --db-url "$SUPABASE_DB_URL" -f schema.sql
npx supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy \
  -x storage.buckets_vectors -x storage.vector_indexes -f data.sql

tar czf - roles.sql schema.sql data.sql | age -r "$BACKUP_AGE_RECIPIENT" -o "$out"
echo "backup: $(basename "$out") ($(du -h "$out" | cut -f1))"
