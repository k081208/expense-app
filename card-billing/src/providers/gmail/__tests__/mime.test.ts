import { describe, expect, it } from "vitest";
import {
  decodeBodyData,
  decodeHtmlEntities,
  extractBodyText,
  htmlToText,
  looksGarbled,
  type GmailPayloadPart,
} from "../mime";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const plain = (s: string, charset = "utf-8"): GmailPayloadPart => ({
  mimeType: "text/plain",
  headers: [{ name: "Content-Type", value: `text/plain; charset=${charset}` }],
  body: { size: s.length, data: b64(s) },
});
const html = (s: string): GmailPayloadPart => ({
  mimeType: "text/html",
  headers: [{ name: "Content-Type", value: "text/html; charset=UTF-8" }],
  body: { size: s.length, data: b64(s) },
});

describe("extractBodyText", () => {
  it("単一パートの text/plain を返す", () => {
    const r = extractBodyText(plain("ご請求金額 12,345円\nお支払い日 2026年9月27日"));
    expect(r).toMatchObject({ status: "ok", kind: "text/plain" });
    if (r.status === "ok") expect(r.text).toContain("ご請求金額 12,345円");
  });
  it("multipart/mixed の中の multipart/alternative でも text/plain を優先し、添付は読まない", () => {
    const payload: GmailPayloadPart = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [plain("本文テキスト版です。ご請求金額 12,345円"), html("<p>HTML 版 <b>99,999円</b></p>")],
        },
        {
          mimeType: "application/pdf",
          filename: "meisai.pdf",
          body: { size: 100, attachmentId: "att-1" },
        },
        {
          mimeType: "text/plain",
          filename: "note.txt",
          body: { size: 10, data: b64("添付テキスト 55,555円") },
        },
      ],
    };
    const r = extractBodyText(payload);
    expect(r).toMatchObject({ status: "ok", kind: "text/plain" });
    if (r.status === "ok") {
      expect(r.text).toContain("12,345円");
      expect(r.text).not.toContain("99,999");
      expect(r.text).not.toContain("55,555");
    }
  });
  it("text/plain が無ければ HTML を安全にテキスト化する", () => {
    const r = extractBodyText(
      html(`<html><head><title>t</title><style>.a{color:red}</style><script>alert("x")</script></head>
<body><!-- comment --><table><tr><td>ご請求金額</td><td>&yen;12,345</td></tr>
<tr><td>お支払い期日</td><td>2026&#24180;10&#x6708;5日</td></tr></table>
<p>カード末尾&nbsp;1234</p><img src="x" onerror="alert(1)"></body></html>`),
    );
    expect(r).toMatchObject({ status: "ok", kind: "text/html" });
    if (r.status === "ok") {
      expect(r.text).toContain("ご請求金額 ¥12,345");
      expect(r.text).toContain("お支払い期日 2026年10月5日");
      expect(r.text).toContain("カード末尾 1234");
      expect(r.text).not.toContain("alert");
      expect(r.text).not.toContain("<");
      expect(r.text).not.toContain("color:red");
    }
  });
  it("text/plain が一言だけ（HTML 版をご覧ください）なら HTML を使う", () => {
    const r = extractBodyText({
      mimeType: "multipart/alternative",
      parts: [plain("HTML版をご覧ください"), html("<p>ご請求金額 12,345円</p><p>お支払い日 2026年9月27日</p>")],
    });
    expect(r).toMatchObject({ status: "ok", kind: "text/html" });
  });
  it("本文パートが無ければ missing", () => {
    expect(extractBodyText({ mimeType: "multipart/mixed", parts: [] })).toEqual({ status: "missing" });
    expect(extractBodyText(null)).toEqual({ status: "missing" });
    expect(extractBodyText({ mimeType: "text/plain", body: { size: 0 } })).toEqual({ status: "missing" });
  });
  it("復号できない（文字化けする）本文は decode_failed", () => {
    const garbage = Buffer.from(Array.from({ length: 200 }, (_, i) => (i % 2 ? 0xff : 0xfe))).toString("base64url");
    const r = extractBodyText({
      mimeType: "text/plain",
      headers: [{ name: "Content-Type", value: "text/plain; charset=utf-8" }],
      body: { size: 200, data: garbage },
    });
    expect(r).toEqual({ status: "decode_failed" });
  });
  it("Content-Type の charset が Shift_JIS のとき、UTF-8 で化ける本文はその文字コードで復号する", () => {
    // 「円」の Shift_JIS は 0x89 0x7E
    const sjis = Buffer.from([0x89, 0x7e, 0x20, 0x31, 0x32, 0x33]).toString("base64url");
    const r = extractBodyText({
      mimeType: "text/plain",
      headers: [{ name: "Content-Type", value: "text/plain; charset=Shift_JIS" }],
      body: { size: 6, data: sjis },
    });
    expect(r).toMatchObject({ status: "ok", text: "円 123" });
  });
  it("ISO-2022-JP のエスケープが残った UTF-8 解釈は文字化けとみなし、宣言された文字コードで復号する", () => {
    // ESC $ B 1_ ESC ( B = 「円」
    const jis = Buffer.from("\x1b$B1_\x1b(B 123", "latin1").toString("base64url");
    const r = extractBodyText({
      mimeType: "text/plain",
      headers: [{ name: "Content-Type", value: "text/plain; charset=ISO-2022-JP" }],
      body: { size: 10, data: jis },
    });
    expect(r).toMatchObject({ status: "ok", text: "円 123" });
  });
});

describe("helpers", () => {
  it("decodeBodyData は base64url を UTF-8 文字列にする", () => {
    expect(decodeBodyData(b64("テスト ¥1,000"), null)).toBe("テスト ¥1,000");
    expect(decodeBodyData("%%%", null)).toBe("");
  });
  it("looksGarbled は置換文字の多いテキストを検出する", () => {
    expect(looksGarbled("正常な本文です")).toBe(false);
    expect(looksGarbled("���abc")).toBe(true);
  });
  it("decodeHtmlEntities は名前付き・数値参照を戻す", () => {
    expect(decodeHtmlEntities("&yen;1,000&nbsp;&amp;&lt;b&gt;&#65;&#x42;")).toBe("¥1,000 &<b>AB");
    expect(decodeHtmlEntities("&unknownentity;")).toBe("&unknownentity;");
  });
  it("htmlToText はブロック要素を改行に、セルを空白にする", () => {
    expect(htmlToText("<div>a</div><div>b<br>c</div><table><tr><td>k</td><td>v</td></tr></table>")).toBe(
      "a\nb\nc\nk v",
    );
  });
});
