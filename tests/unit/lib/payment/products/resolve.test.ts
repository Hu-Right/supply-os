/**
 * 商品定价解析 — 四处取价合流的行为钉桩
 *
 * 这些断言的价值不在"实现对不对"，而在**等价性**：合并前后同一个目录行必须
 * 产出同一笔金额与同一个落库快照串，否则合并就是把四个业务的收钱口径悄悄改了。
 * 重点钉三处易漂移：
 * 1) priceRaw 必须是目录原串（"199.00" 不能变 "199"）——财务对账与订单快照按原串；
 * 2) sellable / advisoryOnly 的判定顺序与组合（先不可售、后仅预约）；
 */
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));

import {
  planProductOf,
  serviceProductOf,
  courseProductOf,
  type PlanPriceInput,
  type ServicePriceInput,
} from "@/lib/payment/products";
import { PRODUCT_KIND } from "@/shared/constants/product-kind";

const plan = (over: Partial<PlanPriceInput> = {}): PlanPriceInput => ({
  plan_code: "business",
  name_zh: "商业版",
  price: "8800.00",
  currency: "CNY",
  is_active: 1,
  price_mode: "fixed",
  ...over,
});

const svc = (over: Partial<ServicePriceInput> = {}): ServicePriceInput => ({
  standard_price: "199.00",
  currency: "CNY",
  sale_mode: "self",
  price_from: 0,
  is_active: 1,
  name_zh: "标讯深度拆解报告",
  ...over,
});

describe("planProductOf — 会员套餐", () => {
  it("原串金额与币种原样带出（不能过 Number 再回 String）", () => {
    const p = planProductOf("business", plan());
    expect(p.kind).toBe(PRODUCT_KIND.PLAN);
    expect(p.unitPrice).toBe(8800);
    expect(p.priceRaw).toBe("8800.00");
    expect(p.currency).toBe("CNY");
    expect(p.name).toBe("商业版");
    expect(p.sellable).toBe(true);
    expect(p.priceSource).toBe("plan_catalog");
  });

  it("下架 / 非固定价 → 不可售（对应 PLAN_NOT_SELLABLE）", () => {
    expect(planProductOf("business", plan({ is_active: 0 })).sellable).toBe(false);
    expect(planProductOf("business", plan({ price_mode: "contact" })).sellable).toBe(false);
    expect(planProductOf("business", plan({ price_mode: "free" })).sellable).toBe(false);
  });

  it("币种缺失回落 CNY；空名不做兜底（与原实现一致）", () => {
    const p = planProductOf("business", plan({ currency: null, name_zh: "" }));
    expect(p.currency).toBe("CNY");
    expect(p.name).toBe("");
  });
});

describe("serviceProductOf — 增值服务", () => {
  it("有价自助服务：原串金额 + 可售 + 非预约", () => {
    const p = serviceProductOf("svc_x", svc());
    expect(p.kind).toBe(PRODUCT_KIND.SERVICE);
    expect(p.unitPrice).toBe(199);
    expect(p.priceRaw).toBe("199.00");
    expect(p.sellable).toBe(true);
    expect(p.advisoryOnly).toBe(false);
    expect(p.saleMode).toBe("self");
    expect(p.priceSource).toBe("service_catalog");
  });

  it("无价 / 下架 / 零价 → 不可售（对应 SERVICE_UNAVAILABLE）", () => {
    expect(serviceProductOf("svc_x", svc({ standard_price: null })).sellable).toBe(false);
    expect(serviceProductOf("svc_x", svc({ standard_price: "0.00" })).sellable).toBe(false);
    expect(serviceProductOf("svc_x", svc({ is_active: 0 })).sellable).toBe(false);
  });

  it("留资/合同成交 与「N 元起」→ 仅预约（对应 SERVICE_ADVISORY_ONLY）", () => {
    expect(serviceProductOf("svc_x", svc({ sale_mode: "lead" })).advisoryOnly).toBe(true);
    expect(serviceProductOf("svc_x", svc({ sale_mode: "contract" })).advisoryOnly).toBe(true);
    expect(serviceProductOf("svc_x", svc({ price_from: 1 })).advisoryOnly).toBe(true);
  });

  it("不可售与仅预约可同时为真 —— 调用方必须先判不可售再判预约（顺序即错误码优先级）", () => {
    const p = serviceProductOf("svc_x", svc({ standard_price: null, sale_mode: "contract" }));
    expect(p.sellable).toBe(false);
    expect(p.advisoryOnly).toBe(true);
  });
});

describe("courseProductOf — 培训课程", () => {
  it("单价与币种取自课程行", () => {
    const p = courseProductOf({ id: 7, name_zh: "国际采购研修班", unit_price: "3980.00", currency: "CNY" });
    expect(p.kind).toBe(PRODUCT_KIND.COURSE);
    expect(p.code).toBe("7");
    expect(p.unitPrice).toBe(3980);
    expect(p.name).toBe("国际采购研修班");
    expect(p.priceSource).toBe("training_course");
  });

  it("单价缺失 → 0（由调用方抛 COURSE_PRICE_INVALID）", () => {
    expect(courseProductOf({ id: 7, name_zh: "x", unit_price: null }).unitPrice).toBe(0);
  });
});

// 2026-11-26：学习资料 / 打包套餐业务下线，resolveLearningProduct 及其用例一并移除。
