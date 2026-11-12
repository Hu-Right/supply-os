import { describe, it, expect } from "vitest";
import {
  PRODUCT_KIND,
  classifyProductCode,
  stripProductPrefix,
} from "@/shared/constants/product-kind";

describe("classifyProductCode — 全库唯一的商品类型判定口", () => {
  it("学习资料 / 打包 / 增值服务 / 培训展示码 各归各类", () => {
    expect(classifyProductCode("material_training-doc-04")).toBe(PRODUCT_KIND.MATERIAL);
    expect(classifyProductCode("bundle_all")).toBe(PRODUCT_KIND.BUNDLE);
    expect(classifyProductCode("svc_ai_tender_analysis")).toBe(PRODUCT_KIND.SERVICE);
    expect(classifyProductCode("training_course_7")).toBe(PRODUCT_KIND.COURSE);
  });

  it("会员档无前缀：常见档位码与未知码都归 plan（由目录层判存不存在）", () => {
    expect(classifyProductCode("business")).toBe(PRODUCT_KIND.PLAN);
    expect(classifyProductCode("unlimited")).toBe(PRODUCT_KIND.PLAN);
    // 打错的码不在此层静默吞掉：仍归 plan，由 plan_catalog 查不到抛 PLAN_NOT_FOUND
    expect(classifyProductCode("materail_typo")).toBe(PRODUCT_KIND.PLAN);
  });

  it("空值/非字符串入参不抛错（路由层 body 未校验时的兜底）", () => {
    expect(classifyProductCode("")).toBe(PRODUCT_KIND.PLAN);
    expect(classifyProductCode(undefined)).toBe(PRODUCT_KIND.PLAN);
    expect(classifyProductCode(null)).toBe(PRODUCT_KIND.PLAN);
    expect(classifyProductCode(123)).toBe(PRODUCT_KIND.PLAN);
  });

  it("前后空白不影响判定（plan_code 各入口 trim 口径不一，判定层先归一）", () => {
    expect(classifyProductCode("  bundle_all  ")).toBe(PRODUCT_KIND.BUNDLE);
  });

  it("training_course_ 前缀不会被误判为 material/bundle（长短前缀无包含关系）", () => {
    expect(classifyProductCode("training_course_12")).toBe(PRODUCT_KIND.COURSE);
  });
});

describe("stripProductPrefix — 只剥命名空间前缀", () => {
  it("material_ / bundle_ 剥掉，得到目录表主键", () => {
    expect(stripProductPrefix("material_training-doc-04")).toBe("training-doc-04");
    expect(stripProductPrefix("bundle_all")).toBe("all");
  });

  it("svc_ 属于 SKU 码本身，不剥（剥了 service_catalog 就查不到行）", () => {
    expect(stripProductPrefix("svc_ai_tender_analysis")).toBe("svc_ai_tender_analysis");
  });

  it("会员档码原样返回", () => {
    expect(stripProductPrefix("business")).toBe("business");
    expect(stripProductPrefix("")).toBe("");
  });

  it("顺序不可颠倒：先剥前缀再判类型会退化成 plan", () => {
    // 这两个函数各有职责，配对顺序写死为「先 classify 再 strip」。
    // 反过来写不报错、也不抛异常，只会静默把 bundle 判成会员档 —— 用一条断言钉住这个坑。
    expect(classifyProductCode(stripProductPrefix("bundle_all"))).toBe(PRODUCT_KIND.PLAN);
    expect(classifyProductCode("bundle_all")).toBe(PRODUCT_KIND.BUNDLE);
  });
});
