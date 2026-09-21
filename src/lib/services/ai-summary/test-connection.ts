/**
 * LLM 连接测试探测
 * @module lib/services/ai-summary/test-connection
 * @description BYOK 配置保存后（或点击"测试连接"）用最便宜的一次调用验证
 *              baseUrl / apiKey / model 三件套是否可用：max_tokens=1、
 *              按模型档位决定是否携带 temperature、15s 超时。
 *              错误码翻译为面向非技术用户的中文提示（401 Key 无效 / 404 模型名 /
 *              402 欠费 / 429 限流 / 超时…），替代此前直接把 LLM_HTTP_401 抛给用户的体验。
 *              出站请求统一走 fetchWithTimeout（SSRF 净化 + 超时守护）。
 */
import { fetchWithTimeout } from "../translation/fetchWithTimeout";
import { PROBE_TIMEOUT_MS, resolveLlmProfile } from "./llm-profile";

export interface TestConnectionInput {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface TestConnectionResult {
  ok: boolean;
  /** 失败时的用户可读中文提示；成功时为 undefined */
  error?: string;
  /** 成功时端点回显的实际模型名（若有） */
  model?: string;
  /** 端到端探测耗时（毫秒），供前端展示 */
  latencyMs?: number;
}

/** HTTP 状态码 → 非技术用户可自助修复的中文提示 */
export function translateProbeError(status: number): string {
  switch (status) {
    case 400:
      return "请求被端点拒绝，请确认 Base URL 是否为 OpenAI 兼容地址（通常以 /v1 结尾或为厂商官方域名）";
    case 401:
    case 403:
      return "API Key 无效或无权限，请到模型服务商控制台核对后重新填写";
    case 402:
      return "模型服务商账户余额不足（欠费），请先充值";
    case 404:
      return "模型不存在或已下线，请检查模型名称拼写（或改选推荐列表中的模型）";
    case 429:
      return "请求过于频繁或额度已用尽，请稍后再试";
    default:
      return `端点返回异常状态 ${status}，请稍后重试或联系模型服务商`;
  }
}

/** 探测错误响应体提取厂商原始提示（截断防超长），辅助定位 400 类问题 */
function snippet(text: string): string {
  const t = String(text || "").replace(/\s+/g, " ").trim().slice(0, 160);
  return t ? `（端点返回：${t}）` : "";
}

/**
 * 执行一次最小化探测调用。不抛异常——所有失败路径统一折叠为
 * { ok:false, error }，方便路由直接透传给前端。
 */
export async function testLlmConnection(input: TestConnectionInput): Promise<TestConnectionResult> {
  const baseUrl = String(input.baseUrl || "").replace(/\/+$/, "");
  const model = String(input.model || "").trim();
  const profile = resolveLlmProfile(baseUrl, model);

  const payload: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 1,
    stream: false,
  };
  // 与正式调用链路同规则：档位不支持则不携带，避免探测结果与真实调用行为不一致
  if (profile.supportsTemperature) payload.temperature = 0;

  const startedAt = Date.now();
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${String(input.apiKey || "")}`,
        },
        body: JSON.stringify(payload),
      },
      PROBE_TIMEOUT_MS,
    );
    const latencyMs = Date.now() - startedAt;
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      return { ok: false, error: translateProbeError(res.status) + snippet(bodyText), latencyMs };
    }
    const data: any = await res.json().catch(() => null);
    const echoModel = typeof data?.model === "string" && data.model ? data.model : model;
    return { ok: true, model: echoModel, latencyMs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "CHANNEL_TIMEOUT") {
      return {
        ok: false,
        error: `连接超时（${Math.round(PROBE_TIMEOUT_MS / 1000)} 秒），端点可能繁忙或网络不可达，请稍后重试`,
      };
    }
    if (msg.startsWith("CHANNEL_URL_")) {
      return { ok: false, error: "Base URL 不合法：仅允许 HTTPS 公网地址（不允许内网/本地地址）" };
    }
    // fetch 网络层失败（DNS 解析失败 / 连接被拒 / TLS 等）抛 TypeError
    return { ok: false, error: `无法连接到端点：${msg}，请检查 Base URL 拼写与网络` };
  }
}
