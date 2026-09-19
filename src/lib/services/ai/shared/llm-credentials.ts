/**
 * AI 管线共享层：用户 BYOK LLM 配置解析
 * @module lib/services/ai/shared/llm-credentials
 * @description 统一"查找启用配置 → 解密 API Key"链路。此前 ai-summary / ai-score /
 *              ai-match 三处各自实现同一逻辑（含相同的错误分支），收敛后单点维护。
 */
import type { Pool } from "mysql2/promise";
import { LlmConfigRepo } from "../../../repos/llm-config.repo";
import { decryptApiKey } from "../../ai-summary/crypto";
import { errLlmNotConfigured } from "../../ai-summary/errors";
import type { LlmCredentials } from "../../ai-score/llm-client";

export async function resolveLlmCredentials(pool: Pool, userId: number): Promise<LlmCredentials> {
  const config = await new LlmConfigRepo(pool).findActiveByUser(userId);
  if (!config) errLlmNotConfigured();

  let apiKey: string;
  try {
    apiKey = decryptApiKey(config.api_key);
  } catch {
    errLlmNotConfigured();
  }

  return { baseUrl: config.base_url, apiKey, model: config.model };
}
