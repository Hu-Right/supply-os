/**
 * segmentZh 降级路径测试
 *
 * 独立文件原因：vi.mock 为文件级作用域 —— 需在"原生模块不可用"与
 * "jieba 可用但 cut 抛错"两种 mock 形态下分别重载模块，验证降级状态机。
 * 正常分词路径见 segmentZh.test.ts。
 */
import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@node-rs/jieba");
  vi.doUnmock("@node-rs/jieba/dict");
});

describe("segmentZh 降级路径", () => {
  it("原生模块不可用 → 加载降级（jiebaReady=null），分词原文返回", async () => {
    vi.resetModules();
    vi.doMock("@node-rs/jieba", () => {
      throw new Error("simulated: native module unavailable");
    });

    const mod = await import("@/lib/services/meilisearch/segmentZh");
    await expect(mod.jiebaReady).resolves.toBeNull();
    expect(mod.segmentZh("联合国采购公告")).toBe("联合国采购公告");
    expect(mod.segmentZhBatch(["联合国", "采购项目"])).toEqual(["联合国", "采购项目"]);
  });

  it("jieba.cut 抛错 → 单次调用降级为原文（不影响主流程）", async () => {
    vi.resetModules();
    vi.doMock("@node-rs/jieba", () => ({
      Jieba: {
        withDict: () => ({
          cut: () => {
            throw new Error("cut boom");
          },
        }),
      },
    }));
    vi.doMock("@node-rs/jieba/dict", () => ({ dict: {} }));

    const mod = await import("@/lib/services/meilisearch/segmentZh");
    await mod.jiebaReady;
    expect(mod.segmentZh("联合国采购公告")).toBe("联合国采购公告");
  });
});
