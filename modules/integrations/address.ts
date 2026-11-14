// The base URL check (ARCHITECTURE.md, "Integrations are provider folders"): a connection may
// not point the server at itself or at an internal network. It runs when a connection is saved,
// not on each request, and does not pin the address it saw (decided in #44).
import "server-only";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

type Internal = "loopback" | "private" | "link-local";

const RANGES: ReadonlyArray<{
  kind: Internal;
  network: string;
  prefix: number;
  family: "ipv4" | "ipv6";
}> = [
  { kind: "loopback", network: "0.0.0.0", prefix: 8, family: "ipv4" },
  { kind: "loopback", network: "127.0.0.0", prefix: 8, family: "ipv4" },
  { kind: "loopback", network: "::", prefix: 128, family: "ipv6" },
  { kind: "loopback", network: "::1", prefix: 128, family: "ipv6" },
  { kind: "private", network: "10.0.0.0", prefix: 8, family: "ipv4" },
  { kind: "private", network: "172.16.0.0", prefix: 12, family: "ipv4" },
  { kind: "private", network: "192.168.0.0", prefix: 16, family: "ipv4" },
  { kind: "private", network: "fc00::", prefix: 7, family: "ipv6" },
  { kind: "link-local", network: "169.254.0.0", prefix: 16, family: "ipv4" },
  { kind: "link-local", network: "fe80::", prefix: 10, family: "ipv6" },
];

/** One block list per kind. An IPv4-mapped IPv6 address matches its IPv4 range. */
const BLOCKS = RANGES.reduce((blocks, { kind, network, prefix, family }) => {
  const list = blocks.get(kind) ?? new BlockList();
  list.addSubnet(network, prefix, family);
  return blocks.set(kind, list);
}, new Map<Internal, BlockList>());

/** Which internal kind of address this is; none for an address on the internet. */
function internalKind(address: string): Internal | undefined {
  const family = isIP(address) === 6 ? "ipv6" : "ipv4";
  for (const [kind, list] of BLOCKS) if (list.check(address, family)) return kind;
  return undefined;
}

const WHERE: Record<Internal, string> = {
  loopback: "this server itself",
  private: "on a private network",
  "link-local": "on a link-local network",
};

const refusal = (what: string, kind: Internal) =>
  `${what} ${WHERE[kind]}. Enter an address on the internet.`;

/**
 * Why the workspace will not send requests to this base URL, for the user's URL field; none
 * when it may.
 */
export async function baseUrlRefusal(baseUrl: string): Promise<string | undefined> {
  // The URL parser has already normalised IPv4 (`0x7f.1` is `127.0.0.1`) and bracketed IPv6.
  const host = new URL(baseUrl).hostname.replace(/\.$/, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost"))
    return refusal(`${host} is`, "loopback");
  const literal = host.replace(/^\[(.*)\]$/, "$1");
  if (isIP(literal)) {
    const kind = internalKind(literal);
    return kind && refusal(`${host} is`, kind);
  }
  // Every address the name resolves to, since a request may use any of them. A name that does
  // not resolve here is refused too, rather than left to a later lookup that might answer.
  const addresses = await lookup(host, { all: true }).catch(() => undefined);
  if (!addresses?.length) return `${host} could not be found. Check the address.`;
  for (const { address } of addresses) {
    const kind = internalKind(address);
    if (kind) return refusal(`${host} resolves to ${address},`, kind);
  }
  return undefined;
}
