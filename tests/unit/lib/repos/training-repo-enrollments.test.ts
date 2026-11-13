/**
 * TrainingRepo.createEnrollments / bindEnrollmentsToOrder 的 SQL 形状与事务边界
 *
 * @description 2026-11-13 收敛后，「报名」= 一次写 N 行学员（一行一人），
 *              企业信息与期次作为同一批报名的快照逐行冗余。本测试钉四件事：
 *                1. 列清单 ↔ ? 个数 ↔ 取值数组三者同批增减（少一个即参数错位）；
 *                2. N 位学员 = N 次 INSERT，participant_no 由服务端按下标生成；
 *                3. 整批在一个事务内，出错必须 rollback（半批写入比不写更糟）；
 *                4. 绑订单只绑 order_id IS NULL 的行，并用 affectedRows 交回真相。
 */
import { describe, it, expect, vi } from "vitest";
import { TrainingRepo } from "@/lib/repos/training.repo";
import type { Pool } from "mysql2/promise";

function makeRepo() {
  const execute = vi.fn()
    .mockResolvedValueOnce([{ insertId: 101 }])
    .mockResolvedValueOnce([{ insertId: 102 }])
    .mockResolvedValueOnce([{ insertId: 103 }]);
  const conn = {
    beginTransaction: vi.fn(async () => {}),
    execute,
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
  };
  const pool = {
    getConnection: vi.fn(async () => conn),
    query: vi.fn(async () => [[]]),
    execute: vi.fn(async () => [{ affectedRows: 1 }]),
  };
  return { repo: new TrainingRepo(pool as unknown as Pool), execute, conn, pool };
}

/** 拆出 INSERT 的列清单与首行占位符 */
function shapeOf(sql: string) {
  const m = /INSERT INTO training_enrollments\s*\(([\s\S]*?)\)\s*VALUES\s*\(([^)]*)\)/.exec(sql);
  expect(m, "INSERT 形状与预期不符，请同步调整本断言").not.toBeNull();
  return {
    columns: m![1].split(",").map((c) => c.trim()).filter(Boolean),
    placeholdersPerRow: m![2].match(/\?/g)?.length ?? 0,
  };
}

const BASE = {
  userId: 7,
  scheduleId: 2,
  companyName: "某医疗器械有限公司",
  mainProduct: "医用耗材",
  exportExperience: "3~5年",
  certification: "ISO9001\nCE",
  remark: "",
  invoiceEmail: "finance@example.com",
  ip: "127.0.0.1",
};

describe("TrainingRepo.createEnrollments", () => {
  it("列数 = 每行 ? 数，且 userId/期次/企业快照进列清单", async () => {
    const { repo, execute } = makeRepo();
    await repo.createEnrollments({
      ...BASE,
      participants: [{ participant_no: 1, full_name: "张三", phone: "13800000000" }],
    });

    const [sql, params] = execute.mock.calls[0] as [string, unknown[]];
    const { columns, placeholdersPerRow } = shapeOf(sql);
    expect(columns).toContain("user_id");
    expect(columns).toContain("schedule_id");
    expect(columns).toContain("company_name");
    expect(columns).toContain("invoice_email");
    // created_at 由 NOW() 写入，不占占位符：? 数 = 列数 - 1
    expect(placeholdersPerRow).toBe(columns.length - 1);
    expect(params).toHaveLength(placeholdersPerRow);
  });

  it("N 位学员 = N 次 INSERT，序号按 1-based 递增，返回确定的 id 列表", async () => {
    const { repo, execute } = makeRepo();
    const ids = await repo.createEnrollments({
      ...BASE,
      participants: [
        { participant_no: 1, full_name: "张三", phone: "13800000001" },
        { participant_no: 2, full_name: "李四", phone: "13800000002" },
        { participant_no: 3, full_name: "王五", phone: "13800000003" },
      ],
    });

    expect(execute).toHaveBeenCalledTimes(3);
    expect(ids).toEqual([101, 102, 103]);

    const nos = execute.mock.calls.map((c) => {
      const params = c[1] as unknown[];
      // 列顺序：user_id, schedule_id, participant_no, ...
      return params[2];
    });
    expect(nos).toEqual([1, 2, 3]);
  });

  it("空串可选字段落 null，不写空串占位", async () => {
    const { repo, execute } = makeRepo();
    await repo.createEnrollments({
      ...BASE,
      invoiceEmail: "",
      participants: [{ participant_no: 1, full_name: "张三", phone: "13800000000", gender: "", position: "", email: "" }],
    });

    const [, params] = execute.mock.calls[0] as [string, unknown[]];
    const { columns } = shapeOf(execute.mock.calls[0]![0] as string);
    const at = (name: string) => params[columns.indexOf(name)];
    expect(at("gender")).toBeNull();
    expect(at("position")).toBeNull();
    expect(at("email")).toBeNull();
    expect(at("invoice_email")).toBeNull();
  });

  it("中途失败整批回滚（不留半批报名）", async () => {
    const { repo, execute, conn } = makeRepo();
    execute.mockReset();
    execute.mockResolvedValueOnce([{ insertId: 101 }]).mockRejectedValueOnce(new Error("DB down"));

    await expect(
      repo.createEnrollments({
        ...BASE,
        participants: [
          { participant_no: 1, full_name: "张三", phone: "138" },
          { participant_no: 2, full_name: "李四", phone: "139" },
        ],
      }),
    ).rejects.toThrow("DB down");

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);
  });
});

describe("TrainingRepo.createOrder", () => {
  it("product_name 绑定课程名快照，不是空串字面量", async () => {
    const { repo, pool } = makeRepo();
    (pool.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ insertId: 55 }]);

    const id = await repo.createOrder({
      orderNo: "TR20261113120000abcdef",
      userId: 7,
      courseId: 1,
      productName: "联合国采购研修班",
      scheduleId: 2,
      registrationId: 101,
      participantCount: 2,
      unitPrice: 2800,
      totalAmount: 5600,
      currency: "CNY",
      provider: "mock",
      qrCode: null,
      payUrl: null,
      expiresAt: new Date("2026-11-13T08:30:00Z"),
      contactName: null,
      telephone: null,
    });

    const [sql, params] = (pool.execute as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(id).toBe(55);
    expect(sql).toContain("product_name");
    expect(params).toContain("联合国采购研修班");
    // 列清单与占位符同批增减：14 列有值（created_at 走 NOW()）
    expect(params).toHaveLength(14);
  });
});

describe("TrainingRepo.bindEnrollmentsToOrder", () => {
  it("只绑尚未成单的行，并交回 affectedRows（少绑由调用方判为并发冲突）", async () => {
    const { repo, pool } = makeRepo();
    (pool.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ affectedRows: 1 }]);

    const bound = await repo.bindEnrollmentsToOrder(55, [101, 102], 7);

    const [sql, params] = (pool.execute as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("order_id IS NULL");
    expect(params).toEqual([55, 101, 102, 7]);
    expect(bound).toBe(1);
  });

  it("空数组不发 SQL", async () => {
    const { repo, pool } = makeRepo();
    const bound = await repo.bindEnrollmentsToOrder(55, [], 7);
    expect(pool.execute).not.toHaveBeenCalled();
    expect(bound).toBe(0);
  });
});
