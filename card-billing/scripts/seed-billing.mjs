#!/usr/bin/env node
/**
 * 開発・テスト用のダミーデータ投入スクリプト。
 *
 * 【重要】これは開発とテストのためだけのものです。
 *   - アプリ（src/ 配下）からは読み込まれません。本番ビルドにも含まれません。
 *   - このコマンドを明示的に実行したときだけデータが作られます。
 *     アプリの起動時に自動で投入されることはありません。
 *   - 本番のデータベースに対しては実行しないでください。
 *
 * 使い方:
 *   ALLOW_BILLING_SEED=1 npm run billing:seed       -- --email you@example.com
 *   ALLOW_BILLING_SEED=1 npm run billing:seed:clean -- --email you@example.com
 *
 * 投入するのは、実際にご利用中の 11 枚の構成に合わせた「架空の」カードと請求です。
 * カード番号の下 4 桁・金額・支払日はすべてテスト用の作り値で、実在の値ではありません。
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// 安全装置
// ---------------------------------------------------------------------------
function abort(message) {
  console.error(`\n[中止] ${message}\n`);
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  abort("NODE_ENV=production では実行できません。");
}
if (process.env.ALLOW_BILLING_SEED !== "1") {
  abort(
    "テストデータの投入は既定で無効です。\n" +
      "      本番のデータベースでないことを確認したうえで、\n" +
      "      ALLOW_BILLING_SEED=1 を付けて実行してください。",
  );
}

// .env.local を読む（Next.js の外で動くため自前で読み込む）
function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // 環境変数が別の方法で設定されている場合は何もしない
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  abort("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。");
}

const args = process.argv.slice(2);
const clean = args.includes("--clean");
const email = args[args.indexOf("--email") + 1];
const userIdArg = args[args.indexOf("--user") + 1];
if (!args.includes("--email") && !args.includes("--user")) {
  abort("対象ユーザーを --email か --user で指定してください。");
}

// ---------------------------------------------------------------------------
// 日付（すべて実行時に計算する。いつ実行しても「次回」が未来になるように）
// ---------------------------------------------------------------------------
const jstToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const [ty, tm, td] = jstToday.split("-").map(Number);

const iso = (y, m, d) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** 今日以降でいちばん近い「毎月 day 日」。 */
function nextMonthly(day) {
  if (day > td) return iso(ty, tm, day);
  const m = tm === 12 ? 1 : tm + 1;
  const y = tm === 12 ? ty + 1 : ty;
  return iso(y, m, day);
}
/** 指定日の 1 か月前（過去の請求履歴用）。 */
function previousMonthOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return m === 1 ? iso(y - 1, 12, d) : iso(y, m - 1, d);
}
/** next10 と同じ月の月末。 */
function endOfMonthOfNext10() {
  const [y, m] = nextMonthly(10).split("-").map(Number);
  return iso(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate());
}

const D = {
  d10: nextMonthly(10),
  d15: nextMonthly(15),
  d27: nextMonthly(27),
  eom: endOfMonthOfNext10(),
};
D.prev27 = previousMonthOf(D.d27);

// ---------------------------------------------------------------------------
// テストデータ（すべて架空の値）
// ---------------------------------------------------------------------------
const FIXTURE = [
  {
    slug: "rakuten-gold", provider: "rakuten", name: "楽天ゴールド",
    lastFour: "4001", paymentDay: 27,
    billings: [
      // 同じ支払日に Gmail と API の両方がある。表示は API が採用される。
      { source: "gmail", date: D.d27, amount: 82000, status: "success" },
      { source: "api", date: D.d27, amount: 82400, status: "success" },
      // 先月分の履歴。次回支払予定としては採用されない。
      { source: "gmail", date: D.prev27, amount: 50000, status: "success" },
    ],
  },
  {
    slug: "rakuten-pink", provider: "rakuten", name: "楽天PINK",
    lastFour: "4002", paymentDay: 27,
    billings: [{ source: "gmail", date: D.d27, amount: 12300, status: "success" }],
  },
  {
    slug: "paypay", provider: "paypay", name: "PayPayカード",
    lastFour: "4003", paymentDay: 27,
    billings: [{ source: "gmail", date: D.d27, amount: 38500, status: "success" }],
  },
  {
    slug: "amex", provider: "amex", name: "AMEX",
    lastFour: "4004", paymentDay: 10,
    billings: [{ source: "api", date: D.d10, amount: 126800, status: "success" }],
  },
  {
    slug: "jcb-main", provider: "jcb", name: "JCB メイン",
    lastFour: "4005", paymentDay: 10,
    billings: [{ source: "gmail", date: D.d10, amount: 54200, status: "success" }],
  },
  {
    slug: "jcb-sub", provider: "jcb", name: "JCB サブ",
    lastFour: "4006", paymentDay: 10,
    billings: [{ source: "gmail", date: D.d10, amount: 20000, status: "success" }],
  },
  {
    slug: "aupay", provider: "aupay", name: "au PAYカード",
    lastFour: "4007", paymentDay: 15,
    // 確定前の見込み額
    billings: [
      { source: "gmail", date: D.d15, amount: 45000, status: "success", provisional: true },
    ],
  },
  {
    slug: "aeon", provider: "aeon", name: "イオンカード",
    lastFour: "4008", paymentDay: 2,
    // 支払日は分かったが金額が未確定
    billings: [
      { source: "gmail", date: D.eom, amount: null, status: "error", errorCode: "amount_not_finalized" },
    ],
  },
  {
    slug: "saison", provider: "saison", name: "セゾンカード",
    lastFour: "4009", paymentDay: 4,
    // 請求額 0 円（未取得ではなく確定値）
    billings: [{ source: "gmail", date: D.eom, amount: 0, status: "success" }],
  },
  {
    slug: "jaccs", provider: "jaccs", name: "JACCSカード",
    lastFour: "4010", paymentDay: 27,
    // 取得に失敗し、支払日も分からない
    billings: [
      { source: "gmail", date: null, amount: null, status: "error", errorCode: "timeout" },
    ],
  },
  {
    slug: "edion", provider: "edion", name: "エディオンカード",
    lastFour: "4011", paymentDay: 10,
    // 請求情報をまだ一度も取得していないカード
    billings: [],
  },
];

/**
 * 決まった ID を作る。
 * 同じ利用者・同じ slug なら常に同じ ID になるので、
 * 何度実行しても増えず、削除も投入したものだけを狙って消せる。
 */
function stableUuid(...parts) {
  const h = createHash("sha256").update(parts.join(":")).digest("hex");
  return [
    h.slice(0, 8), h.slice(8, 12),
    "4" + h.slice(13, 16),
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function resolveUserId() {
  if (userIdArg && args.includes("--user")) return userIdArg;
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) abort(`ユーザー一覧を取得できませんでした: ${error.message}`);
  const user = data.users.find((u) => u.email === email);
  if (!user) abort(`メールアドレス ${email} のユーザーが見つかりません。`);
  return user.id;
}

const userId = await resolveUserId();

console.log("");
console.log("  対象データベース :", SUPABASE_URL);
console.log("  対象ユーザー     :", userId);
console.log("  操作             :", clean ? "テストデータの削除" : "テストデータの投入");
console.log("");

const cardIds = FIXTURE.map((c) => stableUuid(userId, "card", c.slug));

if (clean) {
  // カードを消せば請求情報は外部キーの CASCADE で一緒に消える
  const { error } = await supabase.from("cards").delete().in("id", cardIds);
  if (error) abort(`削除に失敗しました: ${error.message}`);
  console.log(`  テストカード ${cardIds.length} 枚と、その請求情報を削除しました。`);
  console.log("");
  process.exit(0);
}

// --- カード -----------------------------------------------------------------
const cardRows = FIXTURE.map((c, i) => ({
  id: cardIds[i],
  user_id: userId,
  provider_key: c.provider,
  display_name: c.name,
  last_four: c.lastFour,
  payment_day: c.paymentDay,
  preferred_source: c.billings.some((b) => b.source === "api") ? "api" : "gmail",
  enabled: true,
}));

const { error: cardError } = await supabase
  .from("cards")
  .upsert(cardRows, { onConflict: "id" });
if (cardError) abort(`カードを投入できませんでした: ${cardError.message}`);

// --- 請求情報 ---------------------------------------------------------------
// 一意制約 (card_id, source, payment_date) で UPSERT するため、
// 何度実行しても行は増えず、金額だけが更新される。
const billingRows = FIXTURE.flatMap((c, i) =>
  c.billings.map((b) => ({
    user_id: userId,
    card_id: cardIds[i],
    amount: b.amount,
    payment_date: b.date,
    source: b.source,
    status: b.status,
    is_provisional: b.provisional ?? false,
    error_code: b.errorCode ?? null,
    fetched_at: new Date().toISOString(),
  })),
);

const { error: billingError } = await supabase
  .from("billing_records")
  .upsert(billingRows, { onConflict: "card_id,source,payment_date" });
if (billingError) abort(`請求情報を投入できませんでした: ${billingError.message}`);

console.log(`  カード ${cardRows.length} 枚 / 請求情報 ${billingRows.length} 件を投入しました。`);
console.log("");
console.log("  使用した支払日（実行日をもとに計算した架空の日付）:");
for (const [key, value] of Object.entries(D)) {
  console.log(`    ${key.padEnd(7)} ${value}`);
}
console.log("");
console.log("  削除するには --clean を付けて実行してください。");
console.log("");
