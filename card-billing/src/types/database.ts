/**
 * Supabase のデータベース構造に対応する型。
 *
 * supabase/migrations/ の内容と 1 対 1 で対応する。マイグレーションを変更したら
 * 必ずこのファイルも更新すること。Supabase CLI を使う場合は次のコマンドで
 * 自動生成できる（README の「型の再生成」を参照）:
 *
 *   npx supabase gen types typescript --project-id <ref> --schema public \
 *     > src/types/database.ts
 *
 * 秘密情報を持つ private スキーマは PostgREST へ公開しないため、ここには含めない。
 */

import type { BillingSource, BillingStatus } from "./billing";

/** 連携の種類。'google' = Gmail 用、'api' = カード会社の公式 API。 */
export type ConnectionKind = "google" | "api";

/** 連携の状態。 */
export type ConnectionStatus = "connected" | "expired" | "revoked" | "error";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string | null;
        };
        Relationships: [];
      };

      cards: {
        Row: {
          id: string;
          user_id: string;
          provider_key: string;
          display_name: string;
          /** カード番号の下 4 桁のみ。 */
          last_four: string | null;
          /** 標準的な支払日 (1-31)。 */
          payment_day: number | null;
          preferred_source: BillingSource;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider_key: string;
          display_name: string;
          last_four?: string | null;
          payment_day?: number | null;
          preferred_source?: BillingSource;
          enabled?: boolean;
        };
        Update: {
          provider_key?: string;
          display_name?: string;
          last_four?: string | null;
          payment_day?: number | null;
          preferred_source?: BillingSource;
          enabled?: boolean;
        };
        Relationships: [];
      };

      billing_records: {
        Row: {
          id: string;
          user_id: string;
          card_id: string;
          /** 円・整数。null は未取得。0 は「0 円」という確定値。 */
          amount: number | null;
          /** "YYYY-MM-DD"。不明なら null。 */
          payment_date: string | null;
          source: BillingSource;
          status: BillingStatus;
          /** 確定前の速報値なら true。 */
          is_provisional: boolean;
          /** ProviderErrorCode に対応する内部コード。 */
          error_code: string | null;
          fetched_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          card_id: string;
          amount?: number | null;
          payment_date?: string | null;
          source: BillingSource;
          status: BillingStatus;
          is_provisional?: boolean;
          error_code?: string | null;
          fetched_at?: string;
        };
        Update: {
          amount?: number | null;
          status?: BillingStatus;
          is_provisional?: boolean;
          error_code?: string | null;
          fetched_at?: string;
        };
        Relationships: [];
      };

      connections: {
        Row: {
          id: string;
          user_id: string;
          kind: ConnectionKind;
          provider_key: string;
          status: ConnectionStatus;
          scopes: string[];
          connected_at: string | null;
          /** アクセストークンの有効期限。トークン本体ではない。 */
          expires_at: string | null;
          last_synced_at: string | null;
          last_error_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: ConnectionKind;
          provider_key: string;
          status?: ConnectionStatus;
          scopes?: string[];
          connected_at?: string | null;
          expires_at?: string | null;
          last_synced_at?: string | null;
          last_error_code?: string | null;
        };
        Update: {
          status?: ConnectionStatus;
          scopes?: string[];
          connected_at?: string | null;
          expires_at?: string | null;
          last_synced_at?: string | null;
          last_error_code?: string | null;
        };
        Relationships: [];
      };

      fetch_logs: {
        Row: {
          id: string;
          user_id: string;
          card_id: string | null;
          source: BillingSource | null;
          status: BillingStatus;
          error_code: string | null;
          /** 機密情報を含まない短い文言のみ（200 文字以内）。 */
          message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          card_id?: string | null;
          source?: BillingSource | null;
          status: BillingStatus;
          error_code?: string | null;
          message?: string | null;
        };
        Update: never;
        Relationships: [];
      };
    };

    Views: Record<never, never>;

    /**
     * サーバー専用の関数。EXECUTE 権限は service_role にのみ付与されているため、
     * ブラウザ用クライアントから呼び出しても権限エラーになる。
     */
    Functions: {
      oauth_credentials_get: {
        Args: { p_connection_id: string };
        Returns: {
          access_token_encrypted: string;
          refresh_token_encrypted: string | null;
          access_token_expires_at: string | null;
          key_version: number;
        }[];
      };
      oauth_credentials_upsert: {
        Args: {
          p_connection_id: string;
          p_access_token_encrypted: string;
          p_refresh_token_encrypted: string | null;
          p_access_token_expires_at: string | null;
          p_key_version?: number;
        };
        Returns: undefined;
      };
      oauth_credentials_delete: {
        Args: { p_connection_id: string };
        Returns: undefined;
      };
    };

    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

/** テーブルの行型を短く参照するためのヘルパ。 */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type CardRow = Tables<"cards">;
export type BillingRecordRow = Tables<"billing_records">;
export type ConnectionRow = Tables<"connections">;
export type FetchLogRow = Tables<"fetch_logs">;
export type ProfileRow = Tables<"profiles">;
