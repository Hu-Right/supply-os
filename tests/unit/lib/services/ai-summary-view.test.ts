/**
 * AI 拆标摘要的 wire 键集合取证（命名红线② C 组收敛）。
 *
 * 这条登记项停在 C 的原因是「POST 生成分支触付费 LLM，探针不能打」。但摘要真正会上网的
 * 键名并不取决于是否触 LLM：服务出口只有一个形状（AiSummaryResult），缓存命中与生成完
 * 都走 toResult 映射 DB 列名 → camel。所以用假 repo 打缓存命中这一条路径，
 * 就能在不花钱、不写库的前提下把键集合钉住（脱敏函数另外单独钉）。
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { findMock, removeMock, resolveLlmMock } = vi.hoisted(() => ({
  findMock: vi.fn(),
  removeMock: vi.fn(),
  resolveLlmMock: vi.fn(),
}));

vi.mock("@/lib/repos/ai-summary.repo", () => ({
  AiSummaryRepo: class {
    find = findMock;
    remove = removeMock;
  },
}));

// 缓存命中路径不该碰凭证；这里让它一旦碰就直接抛，用作「没触 LLM」的哨兵
vi.mock("@/lib/services/ai/shared/llm-credentials", () => ({
  resolveLlmCredentials: resolveLlmMock.mockImplementation(async () => {
    throw new Error("不应触达 LLM 凭证解析");
  }),
}));

import { getOrGenerateAiSummary } from "@/lib/services/ai-summary";
import { maskSummaryForFree } from "@/lib/services/benefit-matrix";

const SNAKE_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

/** notice_ai_summaries 的行口径（列名 snake）：服务必须在这里就换成 camel */
const DB_ROW = {
  core_deliverables: "光伏电站 EPC 与设备供货",
  key_qualifications: "要求电力工程施工总承包一级资质，近 3 年类似业绩不少于 2 项",
  payment_cycle: "预付款 10%，进度款按月，质保金 5%",
  competitive_landscape: "本地 EPC 主导",
  bid_strategy: "关注资质与业绩门槛",
  risk_alerts: "汇率与征地进度风险",
  model: "byok-model",
  input_tokens: 1200,
  output_tokens: 300,
};

const SUMMARY_KEYS = [
  "bidStrategy",
  "cached",
  "competitiveLandscape",
  "coreDeliverables",
  "inputTokens",
  "keyQualifications",
  "model",
  "outputTokens",
  "paymentCycle",
  "riskAlerts",
];

describe("getOrGenerateAiSummary — 缓存命中的 wire 形状", () => {
  it("DB 列名在服务出口就换成 camel，键集合恰为 10 项", async () => {
    findMock.mockResolvedValue({ ...DB_ROW });
    const res = await getOrGenerateAiSummary({} as never, 1, 2, false);

    expect([...Object.keys(res)].sort()).toEqual(SUMMARY_KEYS);
    expect(Object.keys(res).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
    expect(res.coreDeliverables).toBe(DB_ROW.core_deliverables);
    expect(res.inputTokens).toBe(1200);
    expect(res.cached).toBe(true);
    expect(resolveLlmMock).not.toHaveBeenCalled();
  });

  it("无缓存时才会去解析 LLM 凭证（说明上一例确实走的是缓存分支）", async () => {
    findMock.mockResolvedValue(null);
    await expect(getOrGenerateAiSummary({} as never, 1, 2, false)).rejects.toThrow("不应触达 LLM 凭证解析");
  });
});

describe("maskSummaryForFree — 低档脱敏不改键名", () => {
  it("只截值、不增删键、不把 camel 键换回列名", async () => {
    findMock.mockResolvedValue({ ...DB_ROW });
    const full = await getOrGenerateAiSummary({} as never, 1, 2, false);
    const masked = maskSummaryForFree(full);

    expect([...Object.keys(masked)].sort()).toEqual([...Object.keys(full)].sort());
    expect(Object.keys(masked).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
    // 采购内容完整保留，其余维度截断或清空：值可以变，键名口径不能变
    expect(masked.coreDeliverables).toBe(full.coreDeliverables);
    expect(masked.keyQualifications.length).toBeLessThanOrEqual(full.keyQualifications.length);
  });
});
