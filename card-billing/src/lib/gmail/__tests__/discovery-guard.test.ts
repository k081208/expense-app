import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 本番で探索機能が使えないことのテスト。
 * 画面（page）の 404 は本番ビルドに対する e2e で確認する。ここでは
 * 判定関数と Server Action の両方が同じ判定で止まることを確かめる。
 */

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const requireUser = vi.fn();
vi.mock("@/lib/auth/session", () => ({ requireUser: () => requireUser() }));

const runGmailDiscovery = vi.fn();
vi.mock("../discovery-run", () => ({
  runGmailDiscovery: (...a: unknown[]) => runGmailDiscovery(...a),
}));

import { isGmailDiscoveryEnabled } from "../discovery-guard";
import { runGmailDiscoveryAction } from "../discovery-actions";

describe("isGmailDiscoveryEnabled", () => {
  it("production では、フラグがあっても無効", () => {
    expect(isGmailDiscoveryEnabled({ NODE_ENV: "production", ENABLE_GMAIL_DISCOVERY: "1" })).toBe(false);
    expect(isGmailDiscoveryEnabled({ NODE_ENV: "production" })).toBe(false);
  });
  it("development でも、明示的なフラグが無ければ無効", () => {
    expect(isGmailDiscoveryEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isGmailDiscoveryEnabled({ NODE_ENV: "development", ENABLE_GMAIL_DISCOVERY: "true" })).toBe(false);
    expect(isGmailDiscoveryEnabled({ NODE_ENV: "development", ENABLE_GMAIL_DISCOVERY: "0" })).toBe(false);
  });
  it("development かつ ENABLE_GMAIL_DISCOVERY=1 のときだけ有効", () => {
    expect(isGmailDiscoveryEnabled({ NODE_ENV: "development", ENABLE_GMAIL_DISCOVERY: "1" })).toBe(true);
    expect(isGmailDiscoveryEnabled({ NODE_ENV: "test", ENABLE_GMAIL_DISCOVERY: "1" })).toBe(true);
  });
});

describe("runGmailDiscoveryAction（Server Action 側のガード）", () => {
  const form = new FormData();
  form.set("days", "365");
  form.set("maxResults", "50");

  beforeEach(() => {
    requireUser.mockResolvedValue({ id: "user-a" });
    runGmailDiscovery.mockResolvedValue({
      generatedAt: "2026-09-01T00:00:00Z", days: 365, maxResults: 50, includeSpamTrash: false,
      plan: { unassignedCards: [], unsupportedCards: [], inactiveConnectionCards: [] }, results: [],
    });
  });

  it("production では Action を直接呼んでも実行されない", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_GMAIL_DISCOVERY", "1");
    const state = await runGmailDiscoveryAction({ status: "idle" }, form);
    expect(state).toEqual({ status: "error", code: "disabled" });
    expect(runGmailDiscovery).not.toHaveBeenCalled();
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("フラグが無ければ development でも実行されない", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_GMAIL_DISCOVERY", "");
    const state = await runGmailDiscoveryAction({ status: "idle" }, form);
    expect(state).toEqual({ status: "error", code: "disabled" });
    expect(runGmailDiscovery).not.toHaveBeenCalled();
  });

  it("有効なときは、ログイン中ユーザーの id で探索を実行する", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_GMAIL_DISCOVERY", "1");
    const state = await runGmailDiscoveryAction({ status: "idle" }, form);
    expect(state.status).toBe("done");
    expect(runGmailDiscovery).toHaveBeenCalledWith("user-a", {
      days: 365, maxResults: 50, includeSpamTrash: false, providerKey: null, extraQuery: "",
    });
  });

  it("対象の会社と追加条件をフォームから受け取る（未知の会社は「すべて」扱い）", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_GMAIL_DISCOVERY", "1");
    const f = new FormData();
    f.set("days", "90"); f.set("maxResults", "200");
    f.set("provider", "jcb"); f.set("extraQuery", "from:example.co.jp");
    await runGmailDiscoveryAction({ status: "idle" }, f);
    expect(runGmailDiscovery).toHaveBeenLastCalledWith("user-a", {
      days: 90, maxResults: 200, includeSpamTrash: false, providerKey: "jcb", extraQuery: "from:example.co.jp",
    });

    const g = new FormData();
    g.set("provider", "not-a-provider");
    await runGmailDiscoveryAction({ status: "idle" }, g);
    expect(runGmailDiscovery).toHaveBeenLastCalledWith("user-a", expect.objectContaining({ providerKey: null }));
  });

  it("探索が例外を投げても、画面には失敗の事実だけを返す", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_GMAIL_DISCOVERY", "1");
    runGmailDiscovery.mockRejectedValue(new Error("Google said: token=SECRET"));
    const state = await runGmailDiscoveryAction({ status: "idle" }, form);
    expect(state).toEqual({ status: "error", code: "failed" });
    expect(JSON.stringify(state)).not.toContain("SECRET");
  });
});
