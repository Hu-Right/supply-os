/**
 * 通知文案渲染单测
 *
 * @module tests/unit/shared/notifications/renderNotification
 * @description 通知标题/正文由前端按 type + payload 渲染（后端不拼中文）。这里钉住：
 *              各类型取值正确、可选参数缺省不出现 `undefined`、未知类型回落兜底快照。
 */
import { describe, it, expect } from "vitest";
import { groupOf, prefixOfGroup, renderNotification } from "@/shared/notifications/renderNotification";

/** 假 t：返回 "key" 或 "key(params)"，便于断言选了哪个键与参数 */
const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}(${JSON.stringify(params)})` : key;

describe("renderNotification", () => {
  it("发布通知：有编号时带 tenderNo，无编号走另一条文案", () => {
    const withNo = renderNotification(t, {
      type: "procurement.published",
      title: "",
      body: "",
      payload: { reference: "OSPR-1", tenderNo: "OSPT-9" },
    });
    expect(withNo.title).toBe("notifTProcurementPublished");
    expect(withNo.body).toContain("notifBProcurementPublished");
    expect(withNo.body).toContain("OSPT-9");

    const withoutNo = renderNotification(t, {
      type: "procurement.published",
      title: "",
      body: "",
      payload: { reference: "OSPR-1", tenderNo: null },
    });
    expect(withoutNo.body).toContain("notifBProcurementPublishedNoTender");
  });

  it("授权驳回：原因缺失时给兜底文案，不输出 undefined", () => {
    const r = renderNotification(t, {
      type: "procurement.authorization_rejected",
      title: "",
      body: "",
      payload: { reference: "OSPR-1" },
    });
    expect(r.body).toContain("notifNoReason");
    expect(r.body).not.toContain("undefined");
  });

  it("自动初审：失败项翻译后用分隔符拼接，并给出项数", () => {
    const r = renderNotification(t, {
      type: "procurement.auto_review",
      title: "",
      body: "",
      payload: { reference: "OSPR-1", result: "risk", failed: ["completeness", "duplication"], count: 2 },
    });
    expect(r.title).toBe("notifTAutoReview");
    expect(r.body).toContain("notifAutoCheckCompleteness");
    expect(r.body).toContain("notifAutoCheckDuplication");
    expect(r.body).toContain("notifListSeparator");
    expect(r.body).toContain('"count":2');
  });

  it("未知类型：回落后端兜底快照（标题/正文原样）", () => {
    const r = renderNotification(t, { type: "future.thing", title: "旧标题", body: "旧正文", payload: null });
    expect(r).toEqual({ title: "旧标题", body: "旧正文" });
  });
});

describe("分类映射", () => {
  it("procurement.* → procurement，buyer.* → account，其余 other", () => {
    expect(groupOf("procurement.auto_review")).toBe("procurement");
    expect(groupOf("buyer.verified")).toBe("account");
    expect(groupOf("system.notice")).toBe("other");
    expect(prefixOfGroup("procurement")).toBe("procurement.");
    expect(prefixOfGroup("account")).toBe("buyer.");
    expect(prefixOfGroup("other")).toBeNull();
  });
});
