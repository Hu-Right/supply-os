/**
 * 学习资料/打包订单服务端定价测试（审查报告 F2）
 *
 * 金额必须来自服务端（DB 资料 price / 静态套餐配置），
 * 客户端传入的 amount / bundle_items 一律忽略。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CreateOrderRequest } from "../types/payment";
import type { PaymentsRepo } from "../repos/payments.repo";
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
  const captured: { amount?: number; rawRequest?: string } = {};
  const paymentsRepo = {
    findPendingOrder: vi.fn().mockResolvedValue(null),
    createOrder: vi.fn(async (args: { amount: number; rawRequest: string; orderNo: string }) => {
      captured.amount = args.amount;
      captured.rawRequest = args.rawRequest;
      return args.orderNo;
    }),
  } as unknown as PaymentsRepo;
  const learningMaterialsRepo = {
    findByMaterialId: vi.fn().mockResolvedValue(material),
  } as unknown as LearningMaterialsRepo;

  // 延迟 import：确保 vi.mock("server-only") 生效后再加载模块
  return { captured, paymentsRepo, learningMaterialsRepo, getService: async () => {
    const mod = await import("./PaymentService");
    const PaymentServiceCtor = mod.PaymentService;
    const svc = new PaymentServiceCtor(paymentsRepo, undefined, learningMaterialsRepo);
    svc.registerStrategy("mock", {
      createPaymentUrl: async () => ({ pay_url: "/pay", qr_code_url: "data:image/png;base64,x" }),
      queryOrderStatus: async () => ({ order_no: "", status: "pending" }),
    } as never);
    return svc;
  } };
}

const baseRequest = (over: Partial<CreateOrderRequest> = {}): CreateOrderRequest => ({
  user_key: "13800000000",
  plan_code: "material_training-doc-01",
  provider: "mock",
  ...over,
});

describe("PaymentService 学习订单服务端定价（F2）", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("material 订单金额取自 DB 定价，客户端 0.01 被忽略", async () => {
    const { captured, getService } = makeService(makeMaterial(1.9));
    const svc = await getService();
    const order = await svc.createOrder(baseRequest({ amount: 0.01 }) as CreateOrderRequest);
    expect(order.amount).toBe(1.9);
    expect(captured.amount).toBe(1.9);
  });

  it("raw_request 记录服务端权威金额", async () => {
    const { captured, getService } = makeService(makeMaterial(1.9));
    const svc = await getService();
    await svc.createOrder(baseRequest({ amount: 0.01 }) as CreateOrderRequest);
    expect(JSON.parse(captured.rawRequest!).amount).toBe(1.9);
  });

  it("material 不存在时拒绝下单（MATERIAL_NOT_FOUND）", async () => {
    const { getService } = makeService(null);
    const svc = await getService();
    await expect(
      svc.createOrder(baseRequest({ amount: 0.01 }) as CreateOrderRequest),
    ).rejects.toThrow("MATERIAL_NOT_FOUND");
  });

  it("bundle 订单金额与条目来自服务端套餐配置", async () => {
    const { captured, getService, learningMaterialsRepo } = makeService(null);
    const svc = await getService();
    const order = await svc.createOrder(baseRequest({
      plan_code: "bundle_bundle-all",
      amount: 0.01,
    }) as CreateOrderRequest);
    expect(order.amount).toBe(99);
    const raw = JSON.parse(captured.rawRequest!);
    expect(raw.bundle_items).toHaveLength(8);
    expect(raw.bundle_items).toContain("training-doc-01");
    // bundle 定价不依赖资料表
    expect(learningMaterialsRepo.findByMaterialId).not.toHaveBeenCalled();
  });

  it("未知 bundle 拒绝下单（BUNDLE_NOT_FOUND）", async () => {
    const { getService } = makeService(null);
    const svc = await getService();
    await expect(
      svc.createOrder(baseRequest({ plan_code: "bundle_not-exist", amount: 0.01 }) as CreateOrderRequest),
    ).rejects.toThrow("BUNDLE_NOT_FOUND");
  });
});
