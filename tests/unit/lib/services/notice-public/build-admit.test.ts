/**
 * buildPublicRow 准入镜像（2026-11-13 构建时摘除回归）
 *
 * 断言不变量：SQL 谓词 PUBLIC_ADMIT_SQL 与 JS 镜像共用稳定过期口径
 * （utils/notice-expired 的 STABLE_EXPIRED_WHERE / isStablyExpired）——
 * 过期超清退余量（30 天）的行返回 null 不入服务表；余量安全垫内照常构建；
 * 无截止（deadline_sec=0）永不过期；既有平台准入语义不受影响。
 */
import { describe, it, expect, vi } from "vitest";
import type { RowDataPacket } from "mysql2/promise";

vi.mock("server-only", () => ({}));

import {
  buildPublicRow, PUBLIC_ADMIT_SQL, PUBLIC_COLS,
  type PublicBuildContext,
} from "@/lib/services/notice-public/build";
import { STABLE_EXPIRED_WHERE, PIPELINE_EXPIRY_GRACE_SECONDS } from "@/lib/utils/notice-expired";

const NOW = Math.floor(Date.now() / 1000);
const STALE_SEC = NOW - PIPELINE_EXPIRY_GRACE_SECONDS - 3600; // 过期超余量
const FRESH_SEC = NOW - 3600;                                  // 过期未满余量
const FUTURE_SEC = NOW + 7 * 24 * 3600;                        // 现役

function makeRow(over: Record<string, unknown> = {}): RowDataPacket {
  return {
    id: 42, notice_id: "REF-001", reference: null, url: null, title: "  Test Title  ",
    description: null, published_date: null, deadline_sec: FUTURE_SEC, country: null,
    notice_type: null, agency: null, agency_full: null, organization: null,
    contacts: null, contact_phone: null, contact_email: null, currency: null,
    estimated_value: null, documents: null, procurement_files: null, external_links: null,
    difficulty: null, registration_level: null, entry_source: "crawl", industry: null,
    beneficiary_countries: null, is_featured: 0, converted_opp_id: 0,
    rfq_status: null, visibility: null, budget_confidential: 0,
    update_time: null, is_opportunity: 0,
    title_clean: null, title_quality: null, title_updated_at: null,
    body_text: null, body_chars: null, content_level: null,
    deadline_state: null, deadline_type: null, deadline_timezone: null,
    effective_ts: null, confidence: null, title_cn: null, description_cn_tr: null,
    ...over,
  } as RowDataPacket;
}

const ctx = {
  countrySnap: undefined,
  platformByHost: new Map(),
  platformByAlias: new Map(),
  buyerIndex: {},
} as unknown as PublicBuildContext;

const maps = {
  attachmentMap: new Map(),
  oppMap: new Map(),
  oppWmByNotice: new Map(),
  oppWmById: new Map(),
};

describe("buildPublicRow 准入镜像（构建时摘除）", () => {
  it("PUBLIC_ADMIT_SQL 内嵌稳定过期谓词（SQL/JS 双侧同口径的 SQL 侧证据）", () => {
    expect(PUBLIC_ADMIT_SQL).toContain(`NOT ${STABLE_EXPIRED_WHERE}`);
  });

  it("稳定过期（超余量）→ 返回 null 不入服务表", () => {
    expect(buildPublicRow(makeRow({ deadline_sec: STALE_SEC }), ctx, maps)).toBeNull();
  });

  it("过期未满余量 → 照常构建（安全垫内陪跑）", () => {
    const row = buildPublicRow(makeRow({ deadline_sec: FRESH_SEC }), ctx, maps);
    expect(row).not.toBeNull();
    expect(row![PUBLIC_COLS.indexOf("notice_pk")]).toBe(42);
  });

  it("无截止（deadline_sec=0）→ 永不过期，照常构建", () => {
    expect(buildPublicRow(makeRow({ deadline_sec: 0 }), ctx, maps)).not.toBeNull();
  });

  it("现役（未来截止）→ 照常构建（回归）", () => {
    expect(buildPublicRow(makeRow({ deadline_sec: FUTURE_SEC }), ctx, maps)).not.toBeNull();
  });

  it("平台草稿行仍被既有准入拒绝（摘除不改可见性语义）", () => {
    expect(buildPublicRow(makeRow({ entry_source: "platform", rfq_status: "draft" }), ctx, maps)).toBeNull();
  });

  it("爬虫行 deadline_sec 为字符串（BIGINT 回串）→ 镜像正常判定", () => {
    expect(buildPublicRow(makeRow({ deadline_sec: String(STALE_SEC) }), ctx, maps)).toBeNull();
    expect(buildPublicRow(makeRow({ deadline_sec: String(FUTURE_SEC) }), ctx, maps)).not.toBeNull();
  });
});
