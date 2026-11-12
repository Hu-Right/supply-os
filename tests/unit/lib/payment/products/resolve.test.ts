/**
 * 商品定价解析 — 四处取价合流的行为钉桩
 *
 * 这些断言的价值不在"实现对不对"，而在**等价性**：合并前后同一个目录行必须
 * 产出同一笔金额与同一个落库快照串，否则合并就是把四个业务的收钱口径悄悄改了。
 * 重点钉三处易漂移：
 * 1) priceRaw 必须是目录原串（"199.00" 不能变 "199"）——财务对账与订单快照按原串；
 * 2) sellable / advisoryOnly 的判定顺序与组合（先不可售、后仅预约）；
 * 3) 学习类的错误原因要能一一映射回原有错误码（MATERIAL_NOT_FOUND / BUNDLE_NOT_FOUND /
 *    INVALID_LEARNING_PLAN_CODE）。
 */
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));

import {
  planProductOf,
  serviceProductOf,
  courseProductOf,
  resolveLearningProduct,
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

describe("resolveLearningProduct — 学习资料 / 打包", () => {
  const findNone = async () => null;

  it("单资料：命中后剥前缀查库，取名走 中文→英文→原码", async () => {
    const find = vi.fn(async () => ({ title_zh: "从业人员工作手册", title_en: "Handbook", price: 9.9 }));
    const r = await resolveLearningProduct("material_training-doc-04", find);
    expect(find).toHaveBeenCalledWith("training-doc-04");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.product.kind).toBe(PRODUCT_KIND.MATERIAL);
      expect(r.product.name).toBe("从业人员工作手册");
      expect(r.product.unitPrice).toBe(9.9);
      expect(r.product.currency).toBe("CNY");
      expect(r.product.priceSource).toBe("learning_material");
    }
  });

  it("单资料查无 → material_not_found（映射 MATERIAL_NOT_FOUND）", async () => {
    const r = await resolveLearningProduct("material_nope", findNone);
    expect(r).toEqual({ ok: false, reason: "material_not_found" });
  });

  it("打包套餐：条目来自静态配置，命中即取套餐价与中文名", async () => {
    const r = await resolveLearningProduct("bundle_bundle-all", findNone);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.product.kind).toBe(PRODUCT_KIND.BUNDLE);
      expect(r.product.priceSource).toBe("learning_bundle");
      expect(r.product.unitPrice).toBeGreaterThan(0);
      expect(r.product.name).not.toBe("");
    }
  });

  it("打包套餐查无 → bundle_not_found（映射 BUNDLE_NOT_FOUND）", async () => {
    const r = await resolveLearningProduct("bundle_not-exist", findNone);
    expect(r).toEqual({ ok: false, reason: "bundle_not_found" });
  });

  it("非学习类码 → invalid_kind（映射 INVALID_LEARNING_PLAN_CODE）", async () => {
    const r = await resolveLearningProduct("business", findNone);
    expect(r).toEqual({ ok: false, reason: "invalid_kind" });
  });
});
