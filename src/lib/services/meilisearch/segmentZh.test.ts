import { describe, it, expect } from "vitest";
import { segmentZh, segmentZhBatch } from "./segmentZh";

describe("segmentZh", () => {
  it("空文本 → 空串", () => {
    expect(segmentZh("")).toBe("");
  });

  it("纯英文 → 原样返回", () => {
    expect(segmentZh("Medical supplies")).toBe("Medical supplies");
  });

  it("纯数字 → 原样返回", () => {
    expect(segmentZh("12345")).toBe("12345");
  });

  it("中文文本 → 分词后空格连接", () => {
    const result = segmentZh("联合国采购公告");
    // jieba 分词结果：至少被切分为多个词
    expect(result).toContain(" ");
    expect(result.length).toBeGreaterThan(0);
  });

  it("中英混合 → 中文部分被分词", () => {
    const result = segmentZh("UNDP采购项目");
    // jieba 对英文字母可能逐字拆分，但中文部分应被分词
    expect(result).toContain("采购");
    expect(result).toContain("项目");
  });
});

describe("segmentZhBatch", () => {
  it("批量分词", () => {
    const results = segmentZhBatch(["联合国", "English", "采购项目"]);
    expect(results).toHaveLength(3);
    expect(results[1]).toBe("English"); // 纯英文不变
  });

  it("空数组 → 空数组", () => {
    expect(segmentZhBatch([])).toEqual([]);
  });
});
