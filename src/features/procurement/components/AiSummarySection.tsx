/**
 * AI 拆标摘要区 v2 — 容器
 * AI Bid Summary Section
 *
 * @module features/procurement/components/AiSummarySection
 * @description 6 维度流式展示：核心交付/资质门槛/商务要素/竞争格局/投标策略/风险提示。
 *              支持 SSE 逐字流式渲染 + 缓存命中即时展示。
 *
 *              2026-10 组件化拆分（335→约 110 行）：6 段状态分支面板见 ./ai-summary/states，
 *              结果网格与维度映射见 ./ai-summary/SummaryGrid；本文件只做状态判定编排。
 */
import { useEffect, useState } from "react";
import type { ErrorClassification } from "@/core/http";
import { AnalyzingPanel, UpgradeGatePanel, LockedPanel, NeedConfigPanel, ErrorPanel, StartPanel } from "./ai-summary/states";
import { SummaryGrid, buildSummaryItems } from "./ai-summary/SummaryGrid";

/** AI 拆标摘要数据结构（6 维度） */
export interface AiSummaryData {
  coreDeliverables?: string;
  keyQualifications?: string;
  paymentAndCycle?: string;
  competitiveLandscape?: string;
  bidStrategy?: string;
  riskAlerts?: string;
}

export interface AiSummarySectionProps {
  data?: AiSummaryData | null;
  loading?: boolean;
  streaming?: boolean;
  error?: ErrorClassification | null;
  llmConfigured?: boolean;
  onConfigure?: () => void;
  /** 点击"开始分析"的回调 */
  onStart?: () => void;
  onRegenerate?: () => void;
  /** 公告处于锁定态（未解锁）：不开放"开始分析"，改为引导解锁 */
  locked?: boolean;
  /** 点击"解锁查看"的回调 */
  onRequestUnlock?: () => void;
  /** 已解锁但当前档位不含 AI 摘要权益（低档只看原文）：引导升级 */
  upgradeLocked?: boolean;
  /** 当前展示为服务端脱敏 teaser（低档 ai_summary=1）：底部内联"升级看完整"提示 */
  masked?: boolean;
  /** 点击"升级解锁 AI 能力"的回调 */
  onUpgrade?: () => void;
}

export function AiSummarySection({
  data,
  loading = false,
  streaming = false,
  error = null,
  llmConfigured = false,
  onConfigure,
  onStart,
  onRegenerate,
  locked = false,
  onRequestUnlock,
  upgradeLocked = false,
  masked = false,
  onUpgrade,
}: AiSummarySectionProps) {
  const items = buildSummaryItems(data);
  const hasData = items.some((item) => item.content);

  // 分析中计时器（让用户明确感知在工作）
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [loading]);

  // 加载中：明确的"分析中"动效面板（旋转+计时），而非静态骨架屏
  if (loading && !hasData) return <AnalyzingPanel elapsed={elapsed} />;

  // 低档已解锁但无 AI 权益：引导升级（区别于未解锁的"引导解锁"）
  if (upgradeLocked && !hasData) return <UpgradeGatePanel onUpgrade={onUpgrade} />;

  // 锁定态：AI 摘要端点强制"登录+解锁"，锁定必 403 core_locked。
  // 与翻译一致（ARCH-P0）：锁定态不开放"开始分析"，改为引导解锁，避免"点了才报错"。
  if (locked && !hasData) return <LockedPanel onRequestUnlock={onRequestUnlock} />;

  // 未配置 LLM 且无数据
  if (!llmConfigured && !hasData) return <NeedConfigPanel onConfigure={onConfigure} />;

  // 错误态
  if (error) return <ErrorPanel error={error} onRegenerate={onRegenerate} />;

  // 无数据占位：已配置 LLM 时显示"开始分析"按钮
  if (!hasData) return <StartPanel llmConfigured={llmConfigured} onStart={onStart} onConfigure={onConfigure} />;

  return <SummaryGrid items={items} streaming={streaming} masked={masked} onUpgrade={onUpgrade} onRegenerate={onRegenerate} />;
}
