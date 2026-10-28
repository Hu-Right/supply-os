/**
 * 公告详情侧三个「整块透出」出口的契约取证（命名红线② B/C 收敛）。
 *
 * 为什么专门测这三个：它们都是 `json(变量)`，门禁静态面看不见键，唯一可查的事实源
 * 就是服务返回类型。而上一版把两个包装层的返回类型抹平了——
 * `fetchNoticeTranslation: Promise<unknown>`、`submitNoticeFeedback: Promise<Record<string, unknown>>`
 * （后者还带一次 `as unknown as` 双断言）——「看不见」就变成了「没人能查」。
 * 本测试同时钉两件事：① 返回类型必须是具名契约（tsc --noEmit 覆盖 tests/，退回 unknown 就编不过）；
 * ② 运行期真实键集合全 camelCase。
 *
 * 全程假 repo，不连库、不打外部翻译 API、不写任何数据。
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { poolStub } = vi.hoisted(() => ({
  poolStub: { query: vi.fn(), execute: vi.fn(), end: vi.fn() },
}));

vi.mock("@/lib/db/pool", () => ({ getPool: () => poolStub }));

vi.mock("@/lib/repos/notices/notice-detail.repo", () => ({
  NoticeDetailRepo: class {
    async findDetail() {
      return { id: 1, title: "Construction of a solar park", notice_type: "WORKS", country: "Egypt" };
    }
  },
}));

// zh 快速路径只需要「标题已缓存」这一件事成立，就能拿到确定形态的返回
vi.mock("@/lib/repos/notices/notice-translation.repo", () => ({
  NoticeTranslationRepo: class {
    async findTranslationCache() {
      return { title_tr: "光伏电站施工招标", description_tr: null };
    }
    async upsertTranslation() {
      return undefined;
    }
  },
}));

vi.mock("@/lib/services/notices/index", () => ({
  findQualifiedOpportunityForNotice: async () => ({ description_cn: "中文采购内容概述" }),
}));

vi.mock("@/lib/repos/notices/notice-favorite.repo", () => ({
  NoticeFavoriteRepo: class {
    async noticeExists() {
      return true;
    }
    async exists() {
      return false; // 未收藏 → 走 insert 分支
    }
    async insert() {
      return undefined;
    }
  },
}));

vi.mock("@/lib/services/commodity/interest", () => ({
  loadNoticeNodeCodes: async () => new Map<number, string[]>(),
  persistInterestNodeCodes: async () => undefined,
  decayInterestNodeCodes: async () => undefined,
}));

vi.mock("@/lib/repos/notices/notice-feedback.repo", () => ({
  NoticeFeedbackRepo: class {
    async insertRecoFeedback() {
      return 2; // INSERT IGNORE 口径：实际插入行数
    }
  },
}));

import {
  fetchNoticeTranslation,
  submitNoticeFeedback,
  toggleNoticeFavorite,
} from "@/lib/services/notice-service";
import { getNoticeTranslation } from "@/lib/services/translation/translation-flow";
import type { NoticeTranslationPayload } from "@/lib/services/translation/translation-flow";
import type { FeedbackResult } from "@/lib/services/notice-actions";
import { NoticeDetailRepo } from "@/lib/repos/notices/notice-detail.repo";
import { NoticeTranslationRepo } from "@/lib/repos/notices/notice-translation.repo";

/** 深扫键名：返回所有 snake_case 键（本域没有 JSON 列，嵌套也一并查） */
function snakeKeys(value: unknown, path = "$", acc: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((v, i) => snakeKeys(v, `${path}[${i}]`, acc));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(k)) acc.push(`${path}.${k}`);
      snakeKeys(v, `${path}.${k}`, acc);
    }
  }
  return acc;
}

describe("notices/[id]/translation 的 wire 契约", () => {
  it("返回类型是具名载荷（不是 unknown），且键全 camel", async () => {
    // 这个「具名类型」标注就是编译期闸门：fetchNoticeTranslation 一旦退回 Promise<unknown>，
    // unknown 不可赋给 NoticeTranslationPayload，tsc --noEmit（tsconfig 含 tests/）当场报错。
    const payload: NoticeTranslationPayload = await fetchNoticeTranslation(1, "zh");
    expect(payload).toEqual({
      lang: "zh",
      title: "光伏电站施工招标",
      description: "中文采购内容概述",
      cached: true,
      source: "description_cn",
    });
    expect(Object.keys(payload).sort()).toEqual(["cached", "description", "lang", "source", "title"]);
    expect(snakeKeys(payload)).toEqual([]);
  });

  it("编排层与包装层给出同一个形状（契约不因包装而漂移）", async () => {
    const deps = {
      pool: poolStub as never,
      detailRepo: new NoticeDetailRepo(poolStub as never),
      translationRepo: new NoticeTranslationRepo(poolStub as never),
    };
    const direct: NoticeTranslationPayload = await getNoticeTranslation(deps, 1, "zh");
    expect(Object.keys(direct).sort()).toEqual(Object.keys(await fetchNoticeTranslation(1, "zh")).sort());
  });
});

describe("notices/[id]/favorite 的 wire 契约", () => {
  it("收藏 toggle 只出一个布尔键 favorited", async () => {
    const result: { favorited: boolean } = await toggleNoticeFavorite({ userId: 7, noticeId: 1 });
    expect(result).toEqual({ favorited: true });
    expect(snakeKeys(result)).toEqual([]);
  });
});

describe("notices/feedback 的 wire 契约", () => {
  it("返回类型是 FeedbackResult（不再被 as unknown 抹成宽表），键为 received/inserted/deduped", async () => {
    // 同上：Record<string, unknown> 不可赋给 FeedbackResult，退回旧写法就编不过
    const result: FeedbackResult = await submitNoticeFeedback({
      userId: 7,
      sessionId: "s-1",
      items: [
        { noticeId: 1, action: "impression", variant: null, dwellMs: null },
        { noticeId: 2, action: "impression", variant: null, dwellMs: null },
      ],
    });
    expect(result).toEqual({ received: 2, inserted: 2, deduped: 0 });
    expect(snakeKeys(result)).toEqual([]);
  });
});
