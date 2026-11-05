# Keycloak realm imports

Keycloak imports every `*.json` realm export in this folder when it starts
(`start-dev --import-realm` in `compose.yaml`). A realm that already exists in the database is
left as it is, so after changing an export run `pnpm stack:reset` or delete the realm in the
admin console.

## `workspace-realm.json`

The app's realm, for local development only. Everything in it is a development value.

- Issuer `http://localhost:8080/realms/workspace`; self-registration and password reset are off.
- Client `workspace-web`: confidential (secret `workspace-web-dev-secret`), authorization code
  flow with PKCE (S256) enforced, no direct access grants. Redirect URI
  `http://localhost:3000/api/auth/callback/keycloak` (Better Auth's callback), post-logout URI
  `http://localhost:3000/`, web origin `http://localhost:3000`.
- No roles beyond Keycloak's defaults: every signed-in user is just authenticated.
- Users, with fixed ids so `sub` survives a `pnpm stack:reset`:

  | Username | Password | Email | id (`sub`) |
  | --- | --- | --- | --- |
  | `alice` | `alice` | alice@example.com | `5a522deb-1a85-475f-9158-f51964697b16` |
  | `bob` | `bob` | bob@example.com | `99256cb5-6309-4bf5-a3aa-dca46532b4ba` |

A user's first sign-in to the app creates their `users` row with this id. Add a user in the
admin console (Users → Create user, then Credentials → Set password with
"Temporary" off), then export to keep it.

## Exporting a realm

After changing a realm in the admin console, write it back into this folder. The export runs a
second Keycloak process next to the server, so it needs its own management port:

```sh
docker compose exec keycloak /opt/keycloak/bin/kc.sh export --realm workspace \
  --dir /tmp/export --users realm_file --http-management-port 9001
docker compose cp keycloak:/tmp/export/workspace-realm.json docker/keycloak/realms/
```

The export contains the client secret and the users' password hashes, which is fine for these
development values and never for a real realm.
