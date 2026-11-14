import { waitLabel, type RecordError } from "@/modules/integrations/contracts";

/**
 * Why a record tool found nothing, in words, after "Could not …:". `notFound` says what was not
 * found: the connection for a search, the record for a read.
 */
export function recordErrorWords(
  error: RecordError,
  providerName: string,
  notFound: string,
): string {
  switch (error.kind) {
    case "not_found":
      return notFound;
    case "no_access":
      return "this thread has no access to that connection";
    case "needs_reconnect":
      return `${providerName} refused the connection’s token; connect it again in Settings`;
    case "rate_limited":
      return `${providerName}’s rate limit is reached, try again in ${waitLabel(error.retryAt)}`;
    case "unreachable":
      return `${providerName} could not be reached`;
    case "invalid_query":
      return `${providerName} could not run the search: ${error.message}`;
  }
}
