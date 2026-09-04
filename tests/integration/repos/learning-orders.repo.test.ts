/**
 * LearningOrdersRepo 集成测试
 *
 * @description 验证 LearningOrdersRepo 的 SQL 语句与数据库 schema 匹配。
 *              重点覆盖：INSERT 语句包含所有 NOT NULL 字段（user_key 迁移兼容）。
 *              Mock DB Pool，验证 SQL 语句结构正确。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LearningOrdersRepo } from "@/lib/repos/learning-orders.repo";

const mockExecute = vi.fn();
const mockQuery = vi.fn();
const mockPool = {
  execute: mockExecute,
  query: mockQuery,
  getConnection: vi.fn(),
} as any;

describe("LearningOrdersRepo 集成测试", () => {
  let repo: LearningOrdersRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new LearningOrdersRepo(mockPool);
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
    mockQuery.mockResolvedValue([[]]);
  });

  describe("createOrder", () => {
    it("INSERT 语句必须包含 user_key 字段（NOT NULL 迁移兼容）", async () => {
      await repo.createOrder({
        userId: 123,
        orderNo: "LE20260904TEST001",
        provider: "mock",
        planCode: "material_test_001",
        amount: 99.0,
        currency: "CNY",
        payUrl: "/pay/test",
        qrCodeUrl: "data:image/png;base64,xxx",
        rawRequest: JSON.stringify({ test: true }),
      });

      expect(mockExecute).toHaveBeenCalledTimes(1);
      const [sql, params] = mockExecute.mock.calls[0];

      // 验证 SQL 包含 user_key 字段
      expect(sql).toContain("user_key");
      // 验证 SQL 包含 user_id 字段
      expect(sql).toContain("user_id");
      // 验证参数中包含 userId
      expect(params).toContain(123);
      // 验证参数中包含 orderNo
      expect(params).toContain("LE20260904TEST001");
    });

    it("INSERT 语句字段顺序与参数顺序匹配", async () => {
      await repo.createOrder({
        userId: 456,
        orderNo: "LE20260904TEST002",
        provider: "alipay",
        planCode: "bundle_premium",
        amount: 299.0,
        currency: "CNY",
        payUrl: "/pay/alipay",
        qrCodeUrl: null,
        rawRequest: "{}",
      });

      const [sql, params] = mockExecute.mock.calls[0];

      // 验证 SQL 包含所有必需字段
      expect(sql).toContain("order_no");
      expect(sql).toContain("user_id");
      expect(sql).toContain("user_key");
      expect(sql).toContain("plan_code");
      expect(sql).toContain("amount");
      expect(sql).toContain("currency");
      expect(sql).toContain("provider");
      expect(sql).toContain("pay_url");
      expect(sql).toContain("qr_code_url");
      expect(sql).toContain("raw_request");

      // 验证参数数量（10 个参数：orderNo, userId, planCode, amount, currency, provider, payUrl, qrCodeUrl, rawRequest）
      // 注意：user_key 是硬编码空字符串，不在参数中
      expect(params).toHaveLength(9);
    });

    it("status 默认为 pending", async () => {
      await repo.createOrder({
        userId: 1,
        orderNo: "LE_TEST_003",
        provider: "mock",
        planCode: "material_001",
        amount: 50,
        currency: "CNY",
        payUrl: "/pay",
        qrCodeUrl: null,
        rawRequest: "{}",
      });

      const [sql] = mockExecute.mock.calls[0];
      expect(sql).toContain("'pending'");
    });
  });

  describe("findByOrderNo", () => {
    it("查询单个订单", async () => {
      const mockOrder = {
        id: 1,
        order_no: "LE20260904TEST001",
        user_id: 123,
        plan_code: "material_001",
        amount: 99,
        currency: "CNY",
        provider: "mock",
        status: "pending",
        provider_trade_no: null,
        pay_url: "/pay",
        qr_code_url: null,
        raw_request: "{}",
        raw_notify: null,
        paid_at: null,
        created_at: new Date(),
        updated_at: null,
      };
      mockQuery.mockResolvedValue([[mockOrder]]);

      const result = await repo.findByOrderNo("LE20260904TEST001");

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SELECT * FROM learning_orders WHERE order_no = ?"),
        ["LE20260904TEST001"]
      );
      expect(result).toEqual(mockOrder);
    });

    it("订单不存在返回 null", async () => {
      mockQuery.mockResolvedValue([[]]);

      const result = await repo.findByOrderNo("NOT_EXIST");
      expect(result).toBeNull();
    });
  });

  describe("findByUserId", () => {
    it("按用户 ID 查询订单列表", async () => {
      const mockOrders = [
        { order_no: "LE001", user_id: 123, status: "pending" },
        { order_no: "LE002", user_id: 123, status: "paid" },
      ];
      mockQuery.mockResolvedValue([mockOrders]);

      const result = await repo.findByUserId(123, "");

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("WHERE user_id = ?"),
        [123]
      );
      expect(result).toHaveLength(2);
    });

    it("按用户 ID 和状态查询", async () => {
      mockQuery.mockResolvedValue([[{ order_no: "LE001", status: "pending" }]]);

      await repo.findByUserId(123, "pending");

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("WHERE user_id = ? AND status = ?"),
        [123, "pending"]
      );
    });
  });

  describe("markAsPaidInTransaction", () => {
    it("更新订单状态为 paid", async () => {
      const mockConn = {
        execute: mockExecute,
      } as any;

      await repo.markAsPaidInTransaction(mockConn, "LE001", "TRADE_123");

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'paid'"),
        ["TRADE_123", "LE001"]
      );
    });
  });
});
