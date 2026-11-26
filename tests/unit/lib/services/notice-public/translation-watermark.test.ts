/**
 * 译文水位选行（服务表回填的增量入口）
 *
 * @description 后台翻译器只写 notice_translations，不碰服务表；应用内靠
 *              `notice_translations.id` 主键水位增量拾取。本测试锁定三条语义：
 *              1) 首次运行只初始化水位到 MAX(id)，不返回任何 id（存量归回填脚本）；
 *              2) 有水位时返回 ids + 下一水位，但**不自己前移**（写入成功后才前移）；
 *              3) 无新译文时返回空且不前移。
 */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { selectNewTranslationNoticeIds } from "@/lib/services/notice-public/rebuild";

const makePool = (responses: unknown[][]) => {
  const query = vi.fn();
  for (const r of responses) query.mockResolvedValueOnce(r);
  const execute = vi.fn().mockResolvedValue([{ affectedRows: 1 }, []]);
  return { pool: { query, execute } as unknown as Pool, query, execute };
};

describe("selectNewTranslationNoticeIds（译文水位）", () => {
  it("首次运行：初始化水位到 MAX(id)，不返回 id", async () => {
    const { pool, query, execute } = makePool([
      [[], []], // sync_watermark 无记录
      [[{ max_id: 123456 }], []], // MAX(id)
    ]);
    const r = await selectNewTranslationNoticeIds(pool);
    expect(r).toEqual({ ids: [], nextWatermark: null });
    expect(query).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO sync_watermark"),
      ["notice_translations_zh", 123456],
    );
  });

  it("有水位：返回 ids 与下一水位，但不在本函数内前移", async () => {
    const { pool, execute } = makePool([
      [[{ id_wm: 50 }], []],
      [
        [
          { id: 60, notice_id: 42 },
          { id: 61, notice_id: 43 },
        ],
        [],
      ],
    ]);
    const r = await selectNewTranslationNoticeIds(pool);
    expect(r).toEqual({ ids: [42, 43], nextWatermark: 61 });
    expect(execute).not.toHaveBeenCalled();
  });

  it("无新译文：返回空、不前移", async () => {
    const { pool, execute } = makePool([
      [[{ id_wm: 50 }], []],
      [[], []],
    ]);
    const r = await selectNewTranslationNoticeIds(pool);
    expect(r).toEqual({ ids: [], nextWatermark: null });
    expect(execute).not.toHaveBeenCalled();
  });
});
