/**
 * 增量同步水位推进：宽表列是 notice_pk（没有 id）。历史实现按 r.id 合并，
 * Map 只有一个 undefined 键，Math.max(watermark, undefined) 得到 NaN，
 * 下一轮 `notice_pk > NaN` 被 mysql2 渲染成裸 NaN → Unknown column 'NaN'。
 */
import { describe, expect, it } from "vitest";
import { nextIncrementalWatermark } from "@/lib/services/meilisearch/sync";

const row = (pk: number) => ({ notice_pk: pk });

describe("nextIncrementalWatermark", () => {
  it("历史 NaN 水位收敛为 0，并按 notice_pk 前进", () => {
    expect(nextIncrementalWatermark([row(1698)] as never, Number.NaN)).toBe(1698);
  });

  it("多行取最大 notice_pk", () => {
    expect(nextIncrementalWatermark([row(1700), row(1800), row(1750)] as never, 0)).toBe(1800);
  });

  it("空结果保持原水位；NaN 归一为 0", () => {
    expect(nextIncrementalWatermark([], 123)).toBe(123);
    expect(nextIncrementalWatermark([], Number.NaN)).toBe(0);
  });

  it("脏 notice_pk（null/字符串）不污染水位", () => {
    expect(nextIncrementalWatermark([{ notice_pk: null }, { notice_pk: "1900" }] as never, 0)).toBe(1900);
  });
});
