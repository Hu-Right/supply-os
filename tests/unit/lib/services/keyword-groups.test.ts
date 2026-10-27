import { describe, it, expect, vi } from "vitest";
import { validateGroupInput, createKeywordGroup, listOfficialKeywordGroups, MAX_GROUPS_PER_USER } from "@/lib/services/keyword-groups";

describe("validateGroupInput", () => {
  it("合法输入：trim、去重、截断到 20 词", () => {
    // 注：brief 原稿用 Array(25).fill("x")，去重后仅剩 3 词，toHaveLength(20) 恒不可满足；
    // 改为 25 个互异填充词，使"去重 + 截断"两条分支都被真实覆盖。
    const v = validateGroupInput({ name: " 光伏 ", terms: ["a", "a", " b ", ...Array.from({ length: 25 }, (_, i) => `x${i}`)] });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.name).toBe("光伏");
      expect(v.terms[0]).toBe("a");
      expect(v.terms).toHaveLength(20);
    }
  });
  it("空名 / 空词 / 超 50 字词 → 不合法", () => {
    expect(validateGroupInput({ name: "", terms: ["a"] }).ok).toBe(false);
    expect(validateGroupInput({ name: "n", terms: [] }).ok).toBe(false);
    expect(validateGroupInput({ name: "n", terms: ["x".repeat(51)] }).ok).toBe(false);
  });
});

describe("createKeywordGroup 编排", () => {
  const makeRepo = () => ({ countByUser: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ id: 9 }) });
  const makeBenefit = (ok: boolean) => ({ isEntitled: vi.fn().mockResolvedValue(ok) } as any);
  /** 官方保留名仓默认未命中；占用分支单独覆写 */
  const makeOfficial = (reserved = false) => ({ isOfficialName: vi.fn().mockResolvedValue(reserved) });

  it("无权益 → forbidden，不触 repo", async () => {
    const repo = makeRepo();
    const r = await createKeywordGroup(repo as any, makeBenefit(false), 7, { name: "n", terms: ["a"] }, makeOfficial() as any);
    expect(r).toEqual({ ok: false, reason: "forbidden" });
    expect(repo.create).not.toHaveBeenCalled();
  });
  it("满 10 组 → pool_full", async () => {
    const repo = makeRepo();
    repo.countByUser.mockResolvedValue(MAX_GROUPS_PER_USER);
    const r = await createKeywordGroup(repo as any, makeBenefit(true), 7, { name: "n", terms: ["a"] }, makeOfficial() as any);
    expect(r).toEqual({ ok: false, reason: "pool_full" });
  });
  it("重名 → duplicate；成功 → { ok, id }", async () => {
    const repo = makeRepo();
    repo.create.mockResolvedValue(null);
    expect(await createKeywordGroup(repo as any, makeBenefit(true), 7, { name: "n", terms: ["a"] }, makeOfficial() as any))
      .toEqual({ ok: false, reason: "duplicate" });
    expect(await createKeywordGroup(makeRepo() as any, makeBenefit(true), 7, { name: "n", terms: ["a"] }, makeOfficial() as any))
      .toEqual({ ok: true, id: 9 });
  });
  it("占用官方保留名 → name_reserved，不落库", async () => {
    const repo = makeRepo();
    const official = makeOfficial(true);
    const r = await createKeywordGroup(repo as any, makeBenefit(true), 7, { name: "光伏 ", terms: ["a"] }, official as any);
    expect(r).toEqual({ ok: false, reason: "name_reserved" });
    expect(repo.create).not.toHaveBeenCalled();
    // 校验收 trim 后名（口径同 validateGroupInput）
    expect(official.isOfficialName).toHaveBeenCalledWith("光伏");
  });
});

describe("listOfficialKeywordGroups 进程内缓存", () => {
  const rows = [{ id: 1, name: "光伏", terms: ["组件"], categoryCode: "energy", sortOrder: 0 }];

  it("force 首次查库；TTL 内再次命中缓存不再查库；再 force 重新查", async () => {
    const repo = { listEnabled: vi.fn().mockResolvedValue(rows) };
    expect(await listOfficialKeywordGroups(repo as any, true)).toEqual(rows);
    expect(repo.listEnabled).toHaveBeenCalledTimes(1);
    expect(await listOfficialKeywordGroups(repo as any)).toEqual(rows);
    expect(repo.listEnabled).toHaveBeenCalledTimes(1); // TTL 内命中缓存
    expect(await listOfficialKeywordGroups(repo as any, true)).toEqual(rows);
    expect(repo.listEnabled).toHaveBeenCalledTimes(2); // force 跳缓存
  });
});
