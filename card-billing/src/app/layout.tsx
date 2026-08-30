import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "カード請求まとめ",
    template: "%s | カード請求まとめ",
  },
  description:
    "複数のクレジットカードの次回請求金額と支払日を1画面でまとめて確認できるアプリ",
  applicationName: "カード請求まとめ",
  appleWebApp: {
    capable: true,
    title: "カード請求",
    statusBarStyle: "black-translucent",
  },
  // 金融情報を扱うため、検索エンジンには載せない
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // ホーム画面から開いたときにアプリらしく見えるよう、テーマ色を端末に合わせる
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
