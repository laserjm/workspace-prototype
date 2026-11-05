import { localStack } from "@conventions/nextjs/testing";

/**
 * True when the compose Postgres runs (`pnpm stack:up`), for `describeIntegration(…, { when:
 * composeStack })`. The tests expect its database migrated (`pnpm db:migrate`).
 */
export function composeStack() {
  return localStack("docker compose exec -T postgres pg_isready -q");
}
