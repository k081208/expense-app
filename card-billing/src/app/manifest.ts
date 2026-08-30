import type { MetadataRoute } from "next";

/**
 * PWA マニフェスト。
 * iPhone / Android のホーム画面に追加してアプリのように使えるようにする。
 * オフライン対応(Service Worker)は MVP の範囲外だが、
 * 後から `public/sw.js` を追加するだけで対応できる構成にしている。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "カード請求まとめ",
    short_name: "カード請求",
    description:
      "複数のクレジットカードの次回請求金額と支払日を1画面でまとめて確認できるアプリ",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f6fa",
    theme_color: "#0b1020",
    lang: "ja",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
