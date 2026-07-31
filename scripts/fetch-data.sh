#!/usr/bin/env bash
# Haalt de laatste stand uit Firebase op naar een lokaal bestand, zodat Claude
# je data kan lezen zonder dat jij hoeft te exporteren.
#
# De data komt in .data/ terecht en die map staat in .gitignore: dit is een
# publieke repo, dus je gezondheidsgeschiedenis hoort hier nooit in te belanden.
#
# Eenmalig instellen:
#   1. Firebase Console -> Projectinstellingen -> Serviceaccounts ->
#      Database-geheimen -> geheim tonen en kopiëren
#   2. echo 'FIREBASE_DB_SECRET=...' > .env.local
#
# Gebruik: ./scripts/fetch-data.sh

set -euo pipefail
cd "$(dirname "$0")/.."

DB_URL="https://my-health-app-9243f-default-rtdb.europe-west1.firebasedatabase.app"

if [ ! -f .env.local ]; then
  echo "Geen .env.local gevonden. Zet daar FIREBASE_DB_SECRET=... in (zie de uitleg boven in dit bestand)." >&2
  exit 1
fi

# shellcheck disable=SC1091
source .env.local

if [ -z "${FIREBASE_DB_SECRET:-}" ]; then
  echo "FIREBASE_DB_SECRET staat niet in .env.local." >&2
  exit 1
fi

mkdir -p .data

if ! curl -fsS "${DB_URL}/users.json?auth=${FIREBASE_DB_SECRET}" -o .data/laatste.json; then
  echo "Ophalen mislukt. Klopt het geheim nog, en staat de database-URL goed?" >&2
  exit 1
fi

if [ "$(cat .data/laatste.json)" = "null" ]; then
  echo "Verbinding werkt, maar er staat nog niets in de database."
  exit 0
fi

dagen=$(grep -o '"date"' .data/laatste.json | wc -l | tr -d ' ')
echo "Opgehaald naar .data/laatste.json — ${dagen} dagen, $(wc -c < .data/laatste.json | tr -d ' ') bytes."
