/**
 * 机构列对外口径回归（2026-11-17 截图事故）
 *
 * 事故：服务表滞后窗口期里列表从主表补齐，SQL 选的是 `n.agency`；而对外契约白名单
 * （notice-public/view.ts 的 NOTICE_CONTRACT_KEYS）只有 buyerName/buyerNameCn，
 * `agency` 在出口被裁掉 ⇒ 前端 `buyerNameCn || buyerName || 来源未提供机构`
 * 全部落到兜底文案，看起来像"源站没给机构"，实际是取数口径丢了字段。
 *
 * [2026-11-18] 主表回退已整体删除（列表只读服务表 notice_public），本文件只保留
 * 出口映射的不变量：服务表行必须经 toNoticeView 产出 buyerName。
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { toNoticeView } from "@/lib/services/notice-public/view";

describe("列表行对外映射", () => {
  it("服务表行经对外视图后保留 buyerName（不被契约白名单裁掉）", () => {
    const view = toNoticeView({ id: 1, buyer_name: "SAM.gov", estimated_value: null });
    expect(view).not.toBeNull();
    expect(view!.buyerName).toBe("SAM.gov");
  });
});