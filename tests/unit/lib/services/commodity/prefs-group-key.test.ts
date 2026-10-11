/**
 * 账号行业偏好 → 品目大类码（行业墙与 prefs 模式的数据源）
 *
 * 钉住三件事：
 * 1. **用最深可判定级**：level5 有值就用它，该级换不出（野码/未认领段）才逐级上溯 ——
 *    同一分支的祖先段前缀相同，上溯不会挪错大类；
 * 2. **字典 level=1（A..J 十个容器）不参与换算**：墙要的是我们自己的 32 大类之一，
 *    容器比大类粗得多，拿它当行业等于墙形同虚设。实测证据（temp/probe77、probe78）：
 *    user=1 订阅 UGT-G-25、user=10 订阅 UGT-G-17，两人的 level1_id 都是 109（容器 J），
 *    旧口径下俩人可见公告**完全相同**（各 40,171 条）—— 选了哪个大类对墙毫无作用；
 * 3. **换不出就返回 null**：不猜一个大类塞进库里（错筛比不筛更难发现），
 *    由调用方如实写 NULL 并交给门禁点名。
 */
import { describe, it, expect } from "vitest";
import type { Pool } from "mysql2/promise";
import { groupCodeOfLevelIds } from "@/lib/services/commodity/tree";

/** 按 id 返回旧字典行 code；查不到的 id 返回空结果集（模拟脏 id） */
function poolByCode(map: Record<number, string | null>): Pool {
  return {
    query: async (_sql: string, params?: unknown[]) => {
      const id = Number((params ?? [])[0]);
      const code = map[id];
      return [[code === null || code === undefined ? {} : { code }]];
    },
  } as unknown as Pool;
}

describe("groupCodeOfLevelIds", () => {
  it("取最深级：level5 的 8 位码落段 43 → UGT-G-07（信息与通信技术）", async () => {
    const pool = poolByCode({ 900: "43211503" });
    expect(await groupCodeOfLevelIds(pool, [101, 100432, 1004321, null, 900])).toBe("UGT-G-07");
  });

  it("最深级换不出就逐级上溯：level5 是未认领段 99，level2 是 10100000 → UGT-G-01", async () => {
    const pool = poolByCode({ 500: "99100000", 300: "10100000" });
    expect(await groupCodeOfLevelIds(pool, [101, 300, null, null, 500])).toBe("UGT-G-01");
  });

  it("只填了 level1（A..J 字母容器）→ null，且根本不查库", async () => {
    let calls = 0;
    const pool = {
      query: async () => {
        calls++;
        return [[{ code: "A" }]];
      },
    } as unknown as Pool;
    expect(await groupCodeOfLevelIds(pool, [100, null, null, null, null])).toBeNull();
    expect(calls).toBe(0);
  });

  it("五级全空 → null", async () => {
    expect(await groupCodeOfLevelIds(poolByCode({}), [null, null, null, null, null])).toBeNull();
  });

  it("id 在字典里查不到行（脏偏好）→ null，不拿空 code 去凑", async () => {
    const pool: Pool = {
      query: async () => [[]],
    } as unknown as Pool;
    expect(await groupCodeOfLevelIds(pool, [null, 123456, null, null, null])).toBeNull();
  });

  it("非 8 位数字的 code（野码）→ null：不裁剪、不补零、不猜", async () => {
    const pool = poolByCode({ 700: "43-2115-03" });
    expect(await groupCodeOfLevelIds(pool, [null, null, null, null, 700])).toBeNull();
  });
});
