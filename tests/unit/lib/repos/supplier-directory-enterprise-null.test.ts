/**
 * 企业写入回归测试：空串不得塌成 NULL
 * @module tests/unit/lib/repos/supplier-directory-enterprise-null.test.ts
 * @description 钉住一次线上故障——supplier.email / website 是 NOT NULL DEFAULT ''，而表单里是选填。
 *              pickEditable 历史上把 "" 转成 null，insertEnterprise/updateEnterprise 于是向 NOT NULL 列
 *              绑定 NULL，在 STRICT_TRANS_TABLES 下直接 1048（"企业信息创建失败"）。
 *              这里用 fake-pool 抓取真正绑定进 SQL 的参数值：留空的 email/website 必须是 ''，不能是 null。
 *              （§8 的教训：只在 API 层 mock 仓储会把错误 SQL 一起打桩固定住、CI 全绿；故测到绑定值这一层。）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupplierDirectoryRepo } from "@/lib/repos/suppliers/supplier-directory.repo";

describe("SupplierDirectoryRepo 写入：留空字段绑定 ''（非 NULL），避免 NOT NULL 列 1048", () => {
  const mockQuery = vi.fn();
  const repo = new SupplierDirectoryRepo({ query: mockQuery } as never);

  beforeEach(() => {
    mockQuery.mockReset();
  });

  /** 解析 INSERT 列清单（VALUES 前那段括号），得到与占位符同序的列名 */
  function insertColNames(sql: string): string[] {
    const m = sql.match(/INSERT INTO supplier \((.*?)\) VALUES/);
    return (m?.[1] ?? "").split(",").map((c) => c.trim());
  }

  /** 解析 UPDATE 的 SET 段列名（去掉尾部固定追加的 verify_status） */
  function setColNames(sql: string): string[] {
    const m = sql.match(/SET (.*?) WHERE/);
    return (m?.[1] ?? "")
      .split(",")
      .map((s) => s.trim().split(" ")[0])
      .filter((c) => c && c !== "verify_status");
  }

  it("insertEnterprise：选填 email/website/position 留空 → 绑定 ''，绝不绑定 NULL", async () => {
    mockQuery.mockResolvedValue([{ insertId: 777 }]);
    await repo.insertEnterprise(
      {
        company: "复现公司",
        name_confirmed: "复现公司",
        contact: "张三",
        phone: "13800000000",
        industry: "机械",
        products: "阀门",
        type: "factory",
        credit_code: "91310000XXXXXXXXXX",
        email: "",
        website: "",
        position: "",
      },
      { verify_status: "pending", source_channel: "self_register" },
    );

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    const cols = insertColNames(sql);
    for (const key of ["email", "website", "position"]) {
      const idx = cols.indexOf(key);
      expect(idx, `列 ${key} 应出现在 INSERT 列清单中`).toBeGreaterThan(-1);
      expect(values[idx], `${key} 不得为 NULL`).not.toBeNull();
      expect(values[idx], `${key} 留空应落 ''`).toBe("");
    }
  });

  it("updateEnterprise：清空 email/website → SET 绑定 ''（非 NULL）", async () => {
    mockQuery.mockResolvedValue([{ affectedRows: 1 }]);
    await repo.updateEnterprise(100, { contact: "李四", email: "", website: "" });

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    const cols = setColNames(sql);
    for (const key of ["email", "website"]) {
      const idx = cols.indexOf(key);
      expect(idx, `SET 段应含 ${key}`).toBeGreaterThan(-1);
      expect(values[idx], `${key} 不得被置 NULL`).not.toBeNull();
      expect(values[idx], `${key} 留空应落 ''`).toBe("");
    }
  });

  it("未提供的键仍不进 SQL（区分'未填'与'填空串'）", async () => {
    mockQuery.mockResolvedValue([{ insertId: 777 }]);
    await repo.insertEnterprise({ company: "c", contact: "张三" }, { verify_status: "pending" });
    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(insertColNames(sql)).not.toContain("email");
  });
});
