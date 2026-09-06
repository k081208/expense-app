import { describe, expect, it } from "vitest";
import { extractSenderAddress, verifySender } from "../extract/sender";

const ALLOW = ["info@mail.example-card.co.jp", "notice@example-card.co.jp"];

describe("extractSenderAddress", () => {
  it("表示名つきの From からアドレスだけを小文字で取り出す", () => {
    expect(extractSenderAddress('"Example Card" <Info@Mail.Example-Card.co.jp>')).toBe("info@mail.example-card.co.jp");
    expect(extractSenderAddress("info@mail.example-card.co.jp")).toBe("info@mail.example-card.co.jp");
    expect(extractSenderAddress("  <info@mail.example-card.co.jp>  ")).toBe("info@mail.example-card.co.jp");
  });
  it("アドレスの形でないもの・複数のアドレスは取り出さない", () => {
    expect(extractSenderAddress(null)).toBeNull();
    expect(extractSenderAddress("")).toBeNull();
    expect(extractSenderAddress("Example Card")).toBeNull();
    expect(extractSenderAddress("<a@example.test>, <b@example.test>")).toBeNull();
  });
});

describe("verifySender（完全一致のみ）", () => {
  it("許可リストと完全一致すれば通る", () => {
    expect(verifySender('"Example" <info@mail.example-card.co.jp>', ALLOW)).toEqual({
      ok: true,
      address: "info@mail.example-card.co.jp",
    });
  });
  it("表示名に正規のアドレスを書いた偽装 From は通らない", () => {
    const r = verifySender('"info@mail.example-card.co.jp" <evil@attacker.example>', ALLOW);
    expect(r.ok).toBe(false);
    expect(r.address).toBe("evil@attacker.example");
  });
  it("似たドメイン（末尾一致・サブドメイン追加・ハイフン違い）は通らない", () => {
    for (const from of [
      "info@mail.example-card.co.jp.attacker.example",
      "info@attacker.mail.example-card.co.jp",
      "info@mail-example-card.co.jp",
      "info@example-card.co.jp",
      "info@mail.example-card.com",
      "notice@mail.example-card.co.jp",
    ]) {
      expect(verifySender(from, ALLOW).ok, from).toBe(false);
    }
  });
  it("From が無い・壊れているときは通らない", () => {
    expect(verifySender(null, ALLOW)).toEqual({ ok: false, address: null });
    expect(verifySender("not an address", ALLOW)).toEqual({ ok: false, address: null });
  });
});
