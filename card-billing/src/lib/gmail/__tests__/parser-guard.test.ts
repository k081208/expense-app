import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Parser プレビューの Server Action が、本番・フラグ無しでは何もしないことのテスト。
 * 画面（page）の 404 は本番ビルドに対する e2e で確認する。
 */

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const requireUser = vi.fn();
vi.mock("@/lib/auth/session", () => ({ requireUser: () => requireUser() }));

const runGmailParserPreview = vi.fn();
vi.mock("../parser-run", () => ({
  runGmailParserPreview: (...a: unknown[]) => runGmailParserPreview(...a),
}));

import { runGmailParserPreviewAction } from "../parser-actions";

describe("runGmailParserPreviewAction（Server Action 側のガード）", () => {
  const form = new FormData();
  form.set("days", "120");
  form.set("maxMessages", "20");

  beforeEach(() => {
    requireUser.mockResolvedValue({ id: "user-a" });
    runGmailParserPreview.mockResolvedValue({
      generatedAt: "2026-09-01T00:00:00Z", days: 120, maxMessages: 20, providerKey: null, includeDebug: false,
      plan: { unassignedCards: [], inactiveConnectionCards: [], unsupportedCards: [] }, results: [],
    });
  });

  it("production では Action を直接呼んでも実行されない", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_GMAIL_DISCOVERY", "1");
    const state = await runGmailParserPreviewAction({ status: "idle" }, form);
    expect(state).toEqual({ status: "error", code: "disabled" });
    expect(runGmailParserPreview).not.toHaveBeenCalled();
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("フラグが無ければ development でも実行されない", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_GMAIL_DISCOVERY", "");
    const state = await runGmailParserPreviewAction({ status: "idle" }, form);
    expect(state).toEqual({ status: "error", code: "disabled" });
    expect(runGmailParserPreview).not.toHaveBeenCalled();
  });

  it("有効なときは、ログイン中ユーザーの id で実行する（フォームの user_id は見ない）", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_GMAIL_DISCOVERY", "1");
    const f = new FormData();
    f.set("days", "90"); f.set("maxMessages", "10"); f.set("provider", "jcb"); f.set("includeDebug", "on");
    f.set("user_id", "someone-else");
    const state = await runGmailParserPreviewAction({ status: "idle" }, f);
    expect(state.status).toBe("done");
    expect(runGmailParserPreview).toHaveBeenCalledWith("user-a", { days: 90, maxMessages: 10, providerKey: "jcb", includeDebug: true });
  });

  it("未対応・未知の会社を指定しても「すべて」扱い", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_GMAIL_DISCOVERY", "1");
    const f = new FormData();
    f.set("provider", "not-a-provider");
    await runGmailParserPreviewAction({ status: "idle" }, f);
    expect(runGmailParserPreview).toHaveBeenLastCalledWith("user-a", expect.objectContaining({ providerKey: null }));
  });

  it("実行が例外を投げても、画面には失敗の事実だけを返す", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_GMAIL_DISCOVERY", "1");
    runGmailParserPreview.mockRejectedValue(new Error("Google said: token=SECRET body=本文"));
    const state = await runGmailParserPreviewAction({ status: "idle" }, form);
    expect(state).toEqual({ status: "error", code: "failed" });
    expect(JSON.stringify(state)).not.toContain("SECRET");
  });
});
