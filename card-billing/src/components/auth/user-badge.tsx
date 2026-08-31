"use client";

import { useEffect, useRef, useState } from "react";
import type { AppUser } from "@/lib/auth/session";

/**
 * ヘッダーに置く小さなユーザー表示。
 *
 * 請求金額より目立たせないため、アバター（32px）だけを出し、
 * 名前は支援技術向けに読み上げられるようにしている。
 *
 * アバターは Google 上の外部画像で、読み込みに失敗することがある。
 * その場合は壊れた画像を出さず、名前の頭文字へ切り替える。
 * 画像の読み込みはハイドレーションより先に終わることがあり、そのときは
 * onError が呼ばれないため、マウント時にも失敗していないかを確認する。
 *
 * next/image は使わない。サイズが 32px 固定の外部画像で最適化の余地が無く、
 * 素の img 要素のほうが読み込み失敗を確実に検知できるため。
 */
export function UserBadge({ user }: { user: AppUser }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const image = imageRef.current;
    // 読み込みが終わっているのに幅が 0 なら失敗している
    if (image?.complete && image.naturalWidth === 0) setImageFailed(true);
  }, []);

  const showsImage = Boolean(user.avatarUrl) && !imageFailed;

  return (
    <span className="shrink-0">
      <span className="sr-only">{user.displayName} としてログイン中</span>
      {showsImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imageRef}
          src={user.avatarUrl as string}
          alt=""
          width={32}
          height={32}
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="size-8 rounded-full border border-border object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand"
        >
          {user.displayName.slice(0, 1)}
        </span>
      )}
    </span>
  );
}
