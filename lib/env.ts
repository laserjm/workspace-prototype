// The only reader of process.env besides
// lib/db/client.ts. Parsed on import, so a missing or malformed value fails `next build` and the
// first request, not a sign-in halfway through.
import "server-only";
import { z } from "zod";

const envSchema = z.object({
  /** Where the app runs; Better Auth builds its callback URLs from it. */
  BETTER_AUTH_URL: z.url(),
  /** Signs the session cookie and encrypts stored tokens. `openssl rand -base64 32`. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** The realm's issuer, e.g. http://localhost:8080/realms/workspace. */
  KEYCLOAK_ISSUER: z.url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1),
  /**
   * The keys that encrypt connection credentials (modules/integrations/vault.ts): comma-separated
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

export const env = envSchema.parse(process.env);
