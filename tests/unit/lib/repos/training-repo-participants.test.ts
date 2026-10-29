/**
 * TrainingRepo.saveParticipants 的 INSERT 形状 —— 钉住 2026-10-29 补的 email 写入口
 *
 * @description 缺陷本体：`training_participants.email varchar(200)` 是真列
 *              （baseline:2298，线上库只读探针实测 11 列含 email），表单也一直在采集，
 *              但 INSERT 只写 7 列 —— 用户填的邮箱静默丢弃，界面无任何报错。
 *              这类「列在、UI 在、写入口不在」的三头不对齐，静态门禁看不见（它只看
 *              响应字段命名），只能由 SQL 形状断言钉：列清单 ↔ ? 个数 ↔ 取值数组三者
 *              必须同批增减，少一个就是 Unknown column 或参数错位。
 */
import { describe, it, expect, vi } from "vitest";
import { TrainingRepo } from "@/lib/repos/training.repo";
import type { Pool } from "mysql2/promise";

function makeRepo() {
  const execute = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
  return { repo: new TrainingRepo({ execute } as unknown as Pool), execute };
}

/** 拆出 INSERT 的列清单与首行占位符 */
function shapeOf(sql: string) {
  const m = /INSERT INTO training_participants \(([\s\S]*?)\)\s*VALUES\s*\(([^)]*)\)/.exec(sql);
  expect(m, "INSERT 形状与预期不符，请同步调整本断言").not.toBeNull();
  return {
    columns: m![1].split(",").map((c) => c.trim()).filter(Boolean),
    placeholdersPerRow: m![2].match(/\?/g)?.length ?? 0,
  };
}

describe("TrainingRepo.saveParticipants", () => {
  it("email 进列清单，且列数 = 每行 ? 数（参数错位防线）", async () => {
    const { repo, execute } = makeRepo();
    await repo.saveParticipants(7, [
      { participant_no: 1, full_name: "张三", email: "zhang@example.com" },
    ]);

    const [sql, params] = execute.mock.calls[1] as [string, unknown[]];
    const { columns, placeholdersPerRow } = shapeOf(sql);
    expect(columns).toContain("email");
    expect(placeholdersPerRow).toBe(columns.length);
    // 1 行 × 8 列，无额外参数
    expect(params).toHaveLength(columns.length);
  });

  it("取值按列顺序落位：email 在第 8 位，缺省落 null 而非塌掉前面的参数", async () => {
    const { repo, execute } = makeRepo();
    await repo.saveParticipants(7, [
      { participant_no: 1, full_name: "张三", gender: "male", email: "zhang@example.com" },
      { participant_no: 2, full_name: "李四" },
    ]);

    const [, params] = execute.mock.calls[1] as [string, unknown[]];
    expect(params).toEqual([
      7, 1, "张三", "male", null, null, null, "zhang@example.com",
      7, 2, "李四", null, null, null, null, null,
    ]);
  });

  it("空串邮箱按 null 入库（列可空，不写空串占位）", async () => {
    const { repo, execute } = makeRepo();
    await repo.saveParticipants(7, [{ participant_no: 1, full_name: "张三", email: "" }]);
    const [, params] = execute.mock.calls[1] as [string, unknown[]];
    expect(params[7]).toBeNull();
  });

  it("重新提交先按订单删旧行；零人不发 INSERT", async () => {
    const { repo, execute } = makeRepo();
    await repo.saveParticipants(7, []);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]![0]).toContain("DELETE FROM training_participants WHERE order_id = ?");
  });
});
