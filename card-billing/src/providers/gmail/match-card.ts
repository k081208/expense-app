import type { GmailCardCandidate, GmailCardMatch } from "./types";

/**
 * メールをどのカードに結びつけるか。
 *
 * - 識別キーは本文の下 4 桁。display_name は使わない
 * - 同じ会社のカードが 1 枚だけなら割り当てだけで決めてよい。ただし登録済みの
 *   下 4 桁があり、本文の下 4 桁がそれと食い違うときは結びつけない
 *   （別のカードのメールを表示してしまわないため）
 * - 2 枚以上なら全カードに下 4 桁の登録が必要。本文の下 4 桁がちょうど 1 枚に
 *   一致したときだけ決める。本文に無い／2 枚以上に一致 → card_match_ambiguous、
 *   本文にはあるがどのカードにも一致しない → card_configuration_required
 */
export function matchCard(
  cards: readonly GmailCardCandidate[],
  bodyLastFour: readonly string[],
): GmailCardMatch {
  if (cards.length === 0) {
    return { status: "error", code: "card_configuration_required", detail: "対象のカードがありません" };
  }

  if (cards.length === 1) {
    const card = cards[0];
    if (card.lastFour && bodyLastFour.length > 0) {
      return bodyLastFour.includes(card.lastFour)
        ? { status: "matched", card, matchedBy: "last_four" }
        : {
            status: "error",
            code: "card_configuration_required",
            detail: "本文の下4桁が登録済みの下4桁と一致しません",
          };
    }
    return { status: "matched", card, matchedBy: "single_card" };
  }

  const missing = cards.filter((c) => !c.lastFour);
  if (missing.length > 0) {
    return {
      status: "error",
      code: "card_configuration_required",
      detail: `下4桁が未登録のカードがあります（${missing.map((c) => c.displayName).join(" / ")}）`,
    };
  }
  if (bodyLastFour.length === 0) {
    return {
      status: "error",
      code: "card_match_ambiguous",
      detail: "本文に下4桁が無く、複数のカードから絞れません",
    };
  }
  const matched = cards.filter((c) => c.lastFour && bodyLastFour.includes(c.lastFour));
  if (matched.length === 1) return { status: "matched", card: matched[0], matchedBy: "last_four" };
  if (matched.length === 0) {
    return {
      status: "error",
      code: "card_configuration_required",
      detail: "本文の下4桁がどのカードの登録値とも一致しません",
    };
  }
  return {
    status: "error",
    code: "card_match_ambiguous",
    detail: "本文の下4桁が複数のカードに一致します",
  };
}
