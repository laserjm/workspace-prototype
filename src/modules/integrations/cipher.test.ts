import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseKeyring, seal, unseal } from "./cipher";

const keyOf = () => randomBytes(32).toString("base64");
const token = { kind: "token" as const, token: "github_pat_secret" };
const binding = "connection-1:user-a";

describe("parseKeyring", () => {
  it("uses the first key for new secrets and keeps the others", () => {
    const keyring = parseKeyring(`2:${keyOf()},1:${keyOf()}`);
    expect(keyring.current).toBe(2);
    expect([...keyring.keys.keys()]).toEqual([2, 1]);
  });

  it.each(["", "1", "x:abc", `1:${Buffer.alloc(16).toString("base64")}`])(
    "refuses %j",
    (value) => {
      expect(() => parseKeyring(value)).toThrow("INTEGRATION_KEYS");
    },
  );

  it("refuses a version twice", () => {
    expect(() => parseKeyring(`1:${keyOf()},1:${keyOf()}`)).toThrow("twice");
  });
});

describe("seal and unseal", () => {
  const keyring = parseKeyring(`1:${keyOf()}`);

  it("round-trips a credential without storing it in clear", () => {
    const basic = { kind: "basic" as const, username: "ana", password: "s3cret" };
    for (const credential of [token, basic]) {
      const sealed = seal(keyring, credential, binding);
      expect(JSON.stringify(sealed)).not.toContain("secret");
      expect(JSON.stringify(sealed)).not.toContain("s3cret");
      expect(unseal(keyring, sealed, binding)).toEqual(credential);
    }
  });

  it("uses a fresh iv every time", () => {
    expect(seal(keyring, token, binding).iv).not.toBe(
      seal(keyring, token, binding).iv,
    );
  });

  it("refuses a ciphertext bound to another connection or user", () => {
    const sealed = seal(keyring, token, binding);
    expect(() => unseal(keyring, sealed, "connection-1:user-b")).toThrow();
  });

  it("refuses a changed ciphertext", () => {
    const sealed = seal(keyring, token, binding);
    const bytes = Buffer.from(sealed.ciphertext, "base64");
    bytes[0]! ^= 1;
    expect(() =>
      unseal(keyring, { ...sealed, ciphertext: bytes.toString("base64") }, binding),
    ).toThrow();
  });

  it("decrypts with an older key after a new one is added, and refuses once it is gone", () => {
    const old = keyOf();
    const sealed = seal(parseKeyring(`1:${old}`), token, binding);
    expect(unseal(parseKeyring(`2:${keyOf()},1:${old}`), sealed, binding)).toEqual(token);
    expect(() => unseal(parseKeyring(`2:${keyOf()}`), sealed, binding)).toThrow(
      "no key with version 1",
    );
  });
});
