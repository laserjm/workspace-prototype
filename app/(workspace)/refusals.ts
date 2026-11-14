import "server-only";
// The copy the workspace's actions answer a refusal with (docs/adr/0004). It is the adapter's
// half of "a command throws, an adapter maps": actions.ts parses, calls the module and hands
// what it threw to one of these. Each maps every error its module can throw with a `switch` that
// ends in a `never` check, so a new error class fails to compile here until it has its words;
// anything that is not the module's is rethrown as a bug. Kept out of actions.ts, whose every
// export the browser can call, so refusals.test.ts can check the copy without Next.
import { SignedOut } from "@/lib/auth";
import * as integrations from "@/modules/integrations";
import { waitLabel } from "@/modules/integrations/contracts";
import * as threads from "@/modules/threads";

/**
 * An action's refusal: copy the user can read. `field`: the input field it is about. `gone`: the
 * thing the action named no longer exists, so the browser drops it. `signIn`: the session ended.
 */
export type Refusal = { error: string; field?: string; gone?: true; signIn?: true };

const signInAgain: Refusal = {
  error: "Your session has ended. Taking you to sign in…",
  signIn: true,
};

/** Runs a module call; a visitor is told to sign in rather than thrown at. */
export async function signedIn<T>(run: () => Promise<T | Refusal>): Promise<T | Refusal> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof SignedOut) return signInAgain;
    throw error;
  }
}

const WHERE = {
  loopback: "this server itself",
  private: "on a private network",
  "link-local": "on a link-local network",
} as const;

/** The copy for a provider's or a connection's refusal. */
export function connectionRefusal(error: unknown, credentialKind?: "token" | "basic"): Refusal {
  if (!integrations.isIntegrationError(error)) throw error;
  switch (error.name) {
    case "ConnectionNotFound":
      return { error: "This connection no longer exists.", gone: true };
    case "ProviderNotFound":
      return { error: "This provider cannot be connected this way." };
    case "BaseUrlRefused": {
      const { host, reason, resolvedTo } = error;
      if (reason === "missing") return { error: "Enter the address of its API.", field: "baseUrl" };
      if (reason === "unresolved")
        return { error: `${host} could not be found. Check the address.`, field: "baseUrl" };
      const what = resolvedTo ? `${host} resolves to ${resolvedTo},` : `${host} is`;
      return {
        error: `${what} ${WHERE[reason]}. Enter an address on the internet.`,
        field: "baseUrl",
      };
    }
    case "CredentialRejected":
      return {
        error:
          credentialKind === "basic"
            ? `${error.providerName} did not accept this username and password.`
            : `${error.providerName} did not accept this token. Check that it is complete and has not expired.`,
      };
    case "ProviderRateLimited":
      return {
        error: `${error.providerName}'s rate limit is reached. Try again in ${waitLabel(error.retryAt)}.`,
      };
    case "ProviderUnreachable":
      return {
        error: error.status
          ? `${error.providerName} answered with HTTP ${error.status}.`
          : `${error.providerName} at ${error.baseUrl} could not be reached.`,
      };
    default:
      return unmapped(error);
  }
}

/** The copy for a thread's refusal. */
export function threadRefusal(error: unknown): Refusal {
  if (!threads.isThreadError(error)) throw error;
  switch (error.name) {
    case "ThreadNotFound":
      return { error: "This thread no longer exists.", gone: true };
    case "ProjectNotFound":
      return { error: "This project no longer exists.", gone: true };
    case "ThreadIdTaken":
      return { error: "This thread was already started. Reload the page." };
    case "ResponseNotFound":
      return { error: "This response is not stored yet. Try again once it has finished." };
    case "SnoozeTimeInPast":
      return { error: "That time has passed. Choose another time.", field: "until" };
    case "ForeignConnectionAttached":
      // Only an answer attaches connections, and the chat route answers it; no action does.
      throw error;
    default:
      return unmapped(error);
  }
}

/** The compiler's half of the `switch`: reached only by an error class with no case. */
function unmapped(error: never): never {
  throw error;
}
