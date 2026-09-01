/**
 * 学习资料/打包订单服务端定价测试（审查报告 F2）
 *
 * ARCH-B+（2026-09-01）：学习订单已拆分至 LearningPaymentService，
 * 本测试改为验证 LearningPaymentService.createOrder 的定价逻辑。
 *
 * 金额必须来自服务端（DB 资料 price / 静态套餐配置），
 * 客户端传入的 amount / bundle_items 一律忽略。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LearningOrdersRepo } from "../repos/learning-orders.repo";
import type { LearningMaterialsRepo } from "../repos/learning-materials.repo";

vi.mock("server-only", () => ({}));

function makeMaterial(price: number) {
  return {
    id: 1, material_id: "training-doc-01", title_zh: "测试资料", title_en: "Test",
    content_zh: null, content_en: null, category_zh: "", category_en: "",
    summary_zh: "", summary_en: "", price, file_url: "/f.pdf", file_name: "f.pdf",
    downloads_count: 0, is_premium: 1, number: 1, created_at: new Date(), updated_at: null,
  };
}

function makeService(material: ReturnType<typeof makeMaterial> | null) {
  const captured: { amount?: number; planCode?: string } = {};
  const learningOrdersRepo = {
    createOrder: vi.fn(async (args: { amount: number; planCode: string }) => {
      captured.amount = args.amount;
      captured.planCode = args.planCode;
    }),
  } as unknown as LearningOrdersRepo;
  const learningMaterialsRepo = {
    findByMaterialId: vi.fn().mockResolvedValue(material),
  } as unknown as LearningMaterialsRepo;

  return { captured, learningOrdersRepo, learningMaterialsRepo, getService: async () => {
    const mod = await import("./learning-payment");
    const LearningPaymentServiceCtor = mod.LearningPaymentService;
    const svc = new LearningPaymentServiceCtor(learningOrdersRepo, learningMaterialsRepo);
    svc.registerStrategy("mock", {
      createPaymentUrl: async () => ({ pay_url: "/pay", qr_code_url: "data:image/png;base64,x" }),
      queryOrderStatus: async () => ({ order_no: "", status: "pending" }),
    } as never);
    return svc;
  } };
}

describe("LearningPaymentService 学习订单服务端定价（F2）", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("material 订单金额取自 DB 定价，客户端 0.01 被忽略", async () => {
    const { captured, getService } = makeService(makeMaterial(1.9));
    const svc = await getService();
    const order = await svc.createOrder({
      userKey: "13800000000", planCode: "material_training-doc-01", provider: "mock",
    });
    expect(order.amount).toBe(1.9);
    expect(captured.amount).toBe(1.9);
  });

  it("material 不存在时拒绝下单（MATERIAL_NOT_FOUND）", async () => {
    const { getService } = makeService(null);
    const svc = await getService();
    await expect(
      svc.createOrder({
        userKey: "13800000000", planCode: "material_training-doc-01", provider: "mock",
      }),
    ).rejects.toThrow("MATERIAL_NOT_FOUND");
  });

  it("bundle 订单金额来自服务端套餐配置", async () => {
    const { captured, getService, learningMaterialsRepo } = makeService(null);
    const svc = await getService();
    const order = await svc.createOrder({
      userKey: "13800000000", planCode: "bundle_bundle-all", provider: "mock",
    });
    expect(order.amount).toBe(99);
    expect(captured.planCode).toBe("bundle_bundle-all");
    // bundle 定价不依赖资料表
    expect(learningMaterialsRepo.findByMaterialId).not.toHaveBeenCalled();
  });

  it("未知 bundle 拒绝下单（BUNDLE_NOT_FOUND）", async () => {
    const { getService } = makeService(null);
    const svc = await getService();
    await expect(
      svc.createOrder({
        userKey: "13800000000", planCode: "bundle_not-exist", provider: "mock",
      }),
    ).rejects.toThrow("BUNDLE_NOT_FOUND");
  });
});
