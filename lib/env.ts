// The only reader of process.env (Rule 9). Settings come in groups, and each group is parsed the
// first time something asks for it: the tests only ever need the database and the vault.
// instrumentation.ts asks for every group when the server starts, so a missing or malformed
// value stops `next dev` / `next start` before the first request.
import "server-only";
import { z } from "zod";

const databaseSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

const authSchema = z.object({
  /** Where the app runs; Better Auth builds its callback URLs from it. */
  BETTER_AUTH_URL: z.url(),
  /** Signs the session cookie and encrypts stored tokens. `openssl rand -base64 32`. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** The realm's issuer, e.g. http://localhost:8080/realms/workspace. */
  KEYCLOAK_ISSUER: z.url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1),
});

const aiSchema = z.object({
  /** The Vercel AI Gateway's key (lib/ai.ts). */
  AI_GATEWAY_API_KEY: z.string().trim().min(1),
});

const vaultSchema = z.object({
  /**
   * The keys that encrypt connection credentials (lib/db/vault.ts): comma-separated
   * `<version>:<32 bytes in base64>`, the newest first. New secrets use the first; older
   * versions stay to decrypt what they encrypted. Separate from BETTER_AUTH_SECRET.
   */
  INTEGRATION_KEYS: z
    .string()
    .regex(
      /^\d+:[A-Za-z0-9+/]{43}=(,\d+:[A-Za-z0-9+/]{43}=)*$/,
      "INTEGRATION_KEYS is `<version>:<base64 key>,…`; make one with `node -e \"console.log('1:' + require('crypto').randomBytes(32).toString('base64'))\"`",
    ),
});

function envGroup<T extends z.ZodType>(name: string, schema: T) {
  let parsed: z.output<T> | undefined;
  return (): z.output<T> => {
    if (parsed !== undefined) return parsed;
    const result = schema.safeParse(process.env);
    if (!result.success)
      throw new Error(
        `Invalid ${name} settings in the environment (see .env.example):\n${z.prettifyError(result.error)}`,
      );
    parsed = result.data;
    return result.data;
  };
}

export const databaseEnv = envGroup("database", databaseSchema);
export const authEnv = envGroup("sign-in", authSchema);
export const aiEnv = envGroup("AI Gateway", aiSchema);
export const vaultEnv = envGroup("vault", vaultSchema);
