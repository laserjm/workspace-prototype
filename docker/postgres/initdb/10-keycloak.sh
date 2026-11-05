#!/usr/bin/env bash
# Runs once, when the postgres volume is empty: gives Keycloak its own role and database, so
# its tables never share a database with the app's (drizzle/ migrations target $POSTGRES_DB).
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set kc_db="$KEYCLOAK_DB" --set kc_user="$KEYCLOAK_DB_USER" --set kc_password="$KEYCLOAK_DB_PASSWORD" <<'SQL'
CREATE ROLE :"kc_user" WITH LOGIN PASSWORD :'kc_password';
CREATE DATABASE :"kc_db" OWNER :"kc_user";
SQL
