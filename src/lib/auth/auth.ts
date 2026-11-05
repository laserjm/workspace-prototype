// Sign-in with Better Auth against Keycloak (docs/adr/0001, ARCHITECTURE.md "Sign-in"). The only
// module that configures Better Auth; nothing outside lib/auth/ imports `better-auth`.
import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth, keycloak } from "better-auth/plugins/generic-oauth";
import { db } from "@/lib/db/client";
import {
  accountsTable,
  sessionsTable,
  usersTable,
  verificationsTable,
} from "@/lib/db/schema";
import { env } from "@/lib/env";

export const KEYCLOAK_PROVIDER_ID = "keycloak";

function createAuth() {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: {
        user: usersTable,
        session: sessionsTable,
        account: accountsTable,
        verification: verificationsTable,
      },
    }),
    // Keycloak is the only way in: no passwords here, no sign-up route, no account linking.
    emailAndPassword: { enabled: false },
    account: {
      accountLinking: { enabled: false },
      // Keycloak's access and refresh tokens are stored encrypted with BETTER_AUTH_SECRET. The
      // ID token stays readable: sign-out sends it to Keycloak as `id_token_hint`.
      encryptOAuthTokens: true,
    },
    // The profile is Keycloak's: nobody edits, re-mails or deletes a user here.
    disabledPaths: ["/update-user", "/change-email", "/delete-user"],
    user: {
      additionalFields: {
        // Carries the Keycloak `sub` from the profile to the create hook below, which makes it
        // the user's id. A profile field, so it has to accept input; `disabledPaths` keeps it
        // out of reach over HTTP and the users_id_is_keycloak_sub check keeps it equal to `id`.
        keycloakSub: { type: "string", required: false, returned: false },
        lastSignedInAt: { type: "date", required: false, input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // The user's id is their Keycloak `sub`, so `ownerId` is the same in Keycloak, the
          // tokens and every owned row, and survives a `pnpm stack:reset` (fixed realm ids).
          before: async (user) => {
            const { keycloakSub } = user;
            if (typeof keycloakSub !== "string" || keycloakSub === "")
              return false;
            return { data: { ...user, id: keycloakSub } };
          },
        },
      },
      session: {
        create: {
          after: async (session, context) => {
            await context?.context.internalAdapter.updateUser(session.userId, {
              lastSignedInAt: session.createdAt,
            });
          },
        },
      },
    },
    plugins: [
      genericOAuth({
        config: [
          {
            ...keycloak({
              issuer: env.KEYCLOAK_ISSUER,
              clientId: env.KEYCLOAK_CLIENT_ID,
              clientSecret: env.KEYCLOAK_CLIENT_SECRET,
              // Name and email follow Keycloak on every sign-in.
              overrideUserInfo: true,
            }),
            mapProfileToUser: (profile) => ({ keycloakSub: profile.sub }),
          },
        ],
      }),
    ],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

/** Built on first use, so importing a route needs neither the database nor the env (NX-TYPE-06). */
export function auth() {
  instance ??= createAuth();
  return instance;
}
