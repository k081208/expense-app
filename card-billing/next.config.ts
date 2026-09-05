import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    /**
     * 開発サーバーは受け取ったリクエストの URL をそのまま記録する。
     * Gmail 連携のコールバックはクエリに使い捨ての認可コードを含むため、
     * この経路だけ記録対象から外す（本番ビルドではもともと記録されない）。
     */
    incomingRequests: {
      ignore: [/^\/api\/integrations\/gmail\/callback/],
    },
  },
};

export default nextConfig;
