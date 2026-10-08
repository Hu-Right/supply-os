import { describe, it, expect, vi, beforeEach } from "vitest";
import { KeywordGroupsRepo } from "@/lib/repos/keyword-groups.repo";

const mockExecute = vi.fn();
const mockQuery = vi.fn();
const mockPool = { execute: mockExecute, query: mockQuery } as any;

describe("KeywordGroupsRepo", () => {
  let repo: KeywordGroupsRepo;
  beforeEach(() => {
    vi.clearAllMocks();
    repo = new KeywordGroupsRepo(mockPool);
  });

  it("create：terms JSON 序列化入库，返回 insertId", async () => {
    mockExecute.mockResolvedValue([{ insertId: 42 }]);
    const r = await repo.create(7, "光伏逆变器", ["光伏", "inverter"]);
    expect(mockExecute).toHaveBeenCalledWith(
      "INSERT INTO crm_product_keyword_groups (user_id, name, terms) VALUES (?, ?, ?)",
      [7, "光伏逆变器", JSON.stringify(["光伏", "inverter"])],
    );
    expect(r).toEqual({ id: 42 });
  });
  it("create：重名 ER_DUP_ENTRY → null", async () => {
    mockExecute.mockRejectedValue({ code: "ER_DUP_ENTRY" });
    await expect(repo.create(7, "x", ["a"])).resolves.toBeNull();
  });
  it("listByUser：terms 字符串反序列化", async () => {
    mockQuery.mockResolvedValue([[{ id: 1, name: "g", terms: "[\"a\"]", created_at: "t", updated_at: "t" }]]);
    const rows = await repo.listByUser(7);
    expect(rows[0].terms).toEqual(["a"]);
  });
  it("listByUser：mysql2 对 JSON 列直接回数组 → 不再 JSON.parse", async () => {
    mockQuery.mockResolvedValue([[{ id: 2, name: "g", terms: ["光伏", "inverter"], created_at: "t", updated_at: "t" }]]);
    const rows = await repo.listByUser(7);
    expect(rows[0].terms).toEqual(["光伏", "inverter"]);
  });
  it("listByUser：terms 为 NULL → 回落空数组（不能让下游 map 炸）", async () => {
    mockQuery.mockResolvedValue([[{ id: 3, name: "g", terms: null, created_at: "t", updated_at: "t" }]]);
    const rows = await repo.listByUser(7);
    expect(rows[0].terms).toEqual([]);
  });
  it("update：无字段时跳过 SQL", async () => {
    await expect(repo.update(7, 1, {})).resolves.toBe(true);
    expect(mockExecute).not.toHaveBeenCalled();
  });
  it("remove：限定 user_id 防越权", async () => {
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
    await repo.remove(7, 3);
    expect(mockExecute).toHaveBeenCalledWith(
      "DELETE FROM crm_product_keyword_groups WHERE user_id = ? AND id = ?", [7, 3],
    );
  });
  it("countByUser：有行取 cnt，0 或无行都回 0", async () => {
    mockQuery.mockResolvedValue([[{ cnt: 5 }]]);
    await expect(repo.countByUser(7)).resolves.toBe(5);
    mockQuery.mockResolvedValue([[{ cnt: 0 }]]);
    await expect(repo.countByUser(7)).resolves.toBe(0);
    mockQuery.mockResolvedValue([[]]);
    await expect(repo.countByUser(7)).resolves.toBe(0);
  });
});
