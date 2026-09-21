/**
 * 公告权益门控错误归一（V2 档位闸门 vs 解锁闸门）
 * Notice entitlement gate error normalization
 *
 * @module features/procurement/api/notice-gate
 * @description AI 评分/智能匹配等功能的后端 403 有两种语义：
 *              - EC_VIP_ONLY(40041)：档位不足 → 应引导「升级 X 版」；
 *              - 40013/core_locked：公告未解锁 → 应引导「先解锁」。
 *              历史实现把二者都塌缩成 "HTTP 403"，前端一律显示「请先解锁」，对档位不足用户是错提示。
 *              本模块把 api()/fetch 抛出的错误归一为可判定的字符串 token，并提供升级文案。
 */
import { ApiError } from "@/core/http";
import { EC_VIP_ONLY } from "@/shared/constants/api";

/** VIP 档位闸门错误 token 前缀（编码进 error 字符串，供组件识别） */
export const VIP_PREFIX = "VIP_ONLY";

const RANK_TIER: Record<number, string> = {
  1: "个人体验版",
  2: "个人标准版",
  3: "个人专业版",
  4: "企业年度会员",
};

/** 档位 → 中文等级名（0 或未知归为「更高会员等级」） */
export function rankToTierName(rank: number): string {
  return RANK_TIER[rank] ?? "更高会员等级";
}

/**
 * 归一化捕获到的错误为存入状态的字符串：
 * - VIP 档位闸门 → `VIP_ONLY|<requiredRank>`；
 * - 其余 ApiError → `<status> <message>`（保留状态数字，兼容既有 401/403/429 子串判定）；
 * - 非 ApiError → 原 message。
 */
export function gateErrorToken(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === EC_VIP_ONLY) {
      const rr = Number((err.detail as { required_rank?: unknown } | undefined)?.required_rank ?? 0);
      return `${VIP_PREFIX}|${Number.isFinite(rr) ? rr : 0}`;
    }
    return `${err.status} ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * 若 raw 为 VIP 档位 token → 返回「升级 X 版」文案；否则返回 null（交调用方走通用映射）。
 * 文案暂以中文字面兜底（与详情页/对比表 V2 文案本地化专轮一致处理）。
 */
export function vipGateMessage(raw: string): string | null {
  if (!raw.startsWith(`${VIP_PREFIX}|`)) return null;
  const rank = Number(raw.split("|")[1] || 0);
  return `此功能为${rankToTierName(rank)}权益，升级后即可使用。`;
}
