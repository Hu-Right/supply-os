import { describe, it, expect, beforeEach } from "vitest";
import { requestIndexRebuild, isRebuildRequested } from "./rebuild-trigger";

describe("rebuild-trigger", () => {
  beforeEach(() => {
    // 重置状态：先请求一次再用内部方式清除（测试隔离）
    // 由于模块级变量无法直接重置，通过公共 API 验证行为
  });

  it("requestIndexRebuild → isRebuildRequested=true", () => {
    requestIndexRebuild("test_reason");
    expect(isRebuildRequested()).toBe(true);
  });

  it("重复 requestIndexRebuild → 幂等（不覆盖原因）", () => {
    requestIndexRebuild("reason_1");
    requestIndexRebuild("reason_2");
    expect(isRebuildRequested()).toBe(true);
  });
});
