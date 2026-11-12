/**
 * 存量订单 → 统一订单行 映射（回填口径钉桩）
 *
 * 重点钉四件事——每一条都对应一个真实会赔钱/会丢信息的坑：
 * 1) **金额原串**：decimal 读出来是 "8800.00"，过 Number 再回 String 会变 "8800"，
 *    财务快照与对账按原串比对；
 * 2) **升级单的 unit_price 是差价**，不是目标套餐全价 —— 拿全价当单价，按单价×数量对账必错；
 * 3) **打包套餐的包含项**必须落 items_snapshot（旧实现只在履约时读静态配置，配置一改历史单就说不清）；
 *    套餐已下线时如实记 null，不编造条目；
 * 4) 增值服务原表无渠道列，provider 回填 `service`，别让它被当成网关渠道。
 */
import { describe, it, expect } from "vitest";
import {
  orderFromMembershipRow,
  orderFromLearningRow,
  orderFromServiceRow,
  orderFromTrainingRow,
  orderInsertParams,
  ORDERS_COLUMNS,
  type MembershipOrderRow,
  type LearningOrderRow,
  type ServiceOrderRow,
  type TrainingOrderRow,
} from "@/lib/payment/orders/legacy-map";
import { PRODUCT_KIND } from "@/shared/constants/product-kind";

const D = new Date("2026-11-01T02:00:00.000Z");

const membership = (over: Partial<MembershipOrderRow> = {}): MembershipOrderRow => ({
  order_no: "SO20261101A0001", user_id: 7, plan_code: "business",
  amount: "8800.00", currency: "CNY", status: "paid", provider: "alipay",
  provider_trade_no: "T1", order_type: "new", paid_at: D, created_at: D, ...over,
});

const learning = (over: Partial<LearningOrderRow> = {}): LearningOrderRow => ({
  order_no: "LE20261101A0002", user_id: 7, plan_code: "material_training-doc-04",
  amount: "9.90", currency: "CNY", status: "paid", provider: "wechat",
  paid_at: D, created_at: D, ...over,
});

const service = (over: Partial<ServiceOrderRow> = {}): ServiceOrderRow => ({
  order_no: "SV20261101A0003", user_id: 7, service_code: "svc_ai_tender_analysis",
  quantity: 2, unit_price_snapshot: "199.00", amount_total: "398.00",
  currency: "CNY", status: "paid", sale_mode_snapshot: "self",
  granted_subscription_id: 31, paid_at: D, created_at: D, ...over,
});

const training = (over: Partial<TrainingOrderRow> = {}): TrainingOrderRow => ({
  order_no: "TR20261101A0004", user_id: 7, course_id: 7, schedule_id: 12,
  registration_id: 88, participant_count: 3, unit_price: "3980.00",
  total_amount: "11940.00", currency: "CNY", provider: "alipay",
  status: "paid", paid_at: D, expires_at: D, created_at: D, ...over,
});

describe("会员单", () => {
  it("金额原串搬走，不经过 Number", () => {
    const r = orderFromMembershipRow(membership());
    expect(r.product_kind).toBe(PRODUCT_KIND.PLAN);
    expect(r.product_code).toBe("business");
    expect(r.amount).toBe("8800.00");
    expect(r.unit_price).toBe("8800.00");
    expect(r.quantity).toBe(1);
    expect(r.currency).toBe("CNY");
  });

  it("升级单的单价取差价（不是目标套餐全价）", () => {
    const r = orderFromMembershipRow(membership({ order_type: "upgrade", amount: "1200.00", original_order_no: "SO_OLD" }));
    expect(r.order_type).toBe("upgrade");
    expect(r.unit_price).toBe("1200.00");
    expect(r.amount).toBe("1200.00");
    expect(r.original_order_no).toBe("SO_OLD");
  });

  it("套餐名缺失时退码，不留空串", () => {
    expect(orderFromMembershipRow(membership()).product_name).toBe("business");
    expect(orderFromMembershipRow(membership(), "商业版").product_name).toBe("商业版");
  });
});

describe("学习单", () => {
  it("单资料：剥掉命名空间前缀做主键，无构成快照", () => {
    const r = orderFromLearningRow(learning(), { name: "从业人员工作手册" });
    expect(r.product_kind).toBe(PRODUCT_KIND.MATERIAL);
    expect(r.product_code).toBe("training-doc-04");
    expect(r.product_name).toBe("从业人员工作手册");
    expect(r.items_snapshot).toBeNull();
  });

  it("打包套餐：包含项落 items_snapshot（原表最缺的一件信息）", () => {
    const r = orderFromLearningRow(learning({ plan_code: "bundle_bundle-all", amount: "79.00" }), {
      name: "资料1-8全套打包",
      bundleIncludes: ["training-doc-01", "training-doc-02"],
    });
    expect(r.product_kind).toBe(PRODUCT_KIND.BUNDLE);
    expect(r.product_code).toBe("bundle-all");
    const snap = r.items_snapshot as Record<string, unknown>;
    expect(snap.includedMaterialIds).toEqual(["training-doc-01", "training-doc-02"]);
    expect(typeof snap.expandedAt).toBe("string");
    // 结算价是套餐价，不是子项价格之和
    expect(r.amount).toBe("79.00");
  });

  it("打包套餐已下线：如实记 null 并说明无法还原，不编造条目", () => {
    const r = orderFromLearningRow(learning({ plan_code: "bundle_gone" }));
    const snap = r.items_snapshot as Record<string, unknown>;
    expect(snap.includedMaterialIds).toBeNull();
    expect(String(snap.note)).toContain("无法还原");
  });
});

describe("增值服务单", () => {
  it("provider 回填 service（原表无渠道列），数量与单价快照各自保留", () => {
    const r = orderFromServiceRow(service(), "标讯深度拆解报告");
    expect(r.product_kind).toBe(PRODUCT_KIND.SERVICE);
    expect(r.product_code).toBe("svc_ai_tender_analysis");
    expect(r.provider).toBe("service");
    expect(r.quantity).toBe(2);
    expect(r.unit_price).toBe("199.00");
    expect(r.amount).toBe("398.00");
    expect(r.granted_subscription_id).toBe(31);
    expect((r.items_snapshot as Record<string, unknown>).saleMode).toBe("self");
  });

  it("单价快照为空时退总额（不造 0）", () => {
    const r = orderFromServiceRow(service({ unit_price_snapshot: null }));
    expect(r.unit_price).toBe("398.00");
  });
});

describe("培训单", () => {
  it("商品码用课程 id，人数即数量，期次进构成快照，报名行是履约外键", () => {
    const r = orderFromTrainingRow(training(), "国际采购研修班");
    expect(r.product_kind).toBe(PRODUCT_KIND.COURSE);
    expect(r.product_code).toBe("7");
    expect(r.product_name).toBe("国际采购研修班");
    expect(r.quantity).toBe(3);
    expect(r.unit_price).toBe("3980.00");
    expect(r.amount).toBe("11940.00");
    expect(r.granted_registration_id).toBe(88);
    expect(r.items_snapshot).toEqual({ courseId: 7, scheduleId: 12 });
  });

  it("课程名缺失时退展示码（与订单列表的既有约定一致）", () => {
    expect(orderFromTrainingRow(training()).product_name).toBe("training_course_7");
  });
});

describe("orderInsertParams", () => {
  it("参数顺序与 ORDERS_COLUMNS 一致，JSON 列被序列化", () => {
    const r = orderFromLearningRow(learning({ plan_code: "bundle_bundle-all" }), {
      bundleIncludes: ["a"],
    });
    const params = orderInsertParams(r);
    expect(params).toHaveLength(ORDERS_COLUMNS.length);
    expect(params[ORDERS_COLUMNS.indexOf("order_no")]).toBe(r.order_no);
    const snap = params[ORDERS_COLUMNS.indexOf("items_snapshot")];
    expect(typeof snap).toBe("string");
    expect(JSON.parse(String(snap)).includedMaterialIds).toEqual(["a"]);
    // 空 JSON 列给 null，不是 "null" 字符串
    expect(params[ORDERS_COLUMNS.indexOf("raw_notify")]).toBeNull();
  });
});
