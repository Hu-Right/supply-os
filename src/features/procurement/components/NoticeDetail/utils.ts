/**
 * NoticeDetail 工具函数和常量
 * @module features/procurement/components/NoticeDetail/utils
 *
 * 各 Tab 的角标不再是硬编码档位：每个模块声明其门控来源（某权益编码，或"需解锁本条公告"），
 * 真实可见性/解锁由服务端按 plan_benefits 矩阵逐格判定并随 /api/membership/status 下发
 * （见 lib/repos/benefit-system.repo#resolveGates），前端仅据下发的 gates 派生展示状态。
 */
import type { GateState } from "@/types";
import type { NoticeAttachment, NoticeItem } from "../../types";

/** Tab 门控来源：权益编码（矩阵 SSOT）。
 *  2026-10-29 权益大一统：资格条件/原始文件也收进矩阵（qualification_access /
 *  original_file_access），详情页与定价页共用同一份权益定义，不再有独立的"解锁类"角标；
 *  付费用户打开公告时由页面自动解锁（notice_view 不限次），内容直接可看。 */
export interface DetailTabGate {
  /** 权益编码（benefit_code，矩阵 SSOT）。 */
  benefitCode: string;
}

/** Tab 定义 */
export interface DetailTab {
  key: string;
  labelKey: string;
  /** 缺省 = 公开信息 Tab（不挂权益，角标显示「免费」） */
  gate?: DetailTabGate;
}

export const DETAIL_TABS: DetailTab[] = [
  { key: "summary", labelKey: "detail_tabSummary", gate: { benefitCode: "ai_summary" } },
  { key: "qualification", labelKey: "detail_tabQualification", gate: { benefitCode: "qualification_access" } },
  // 联系人属会员权益（采购方已在头部信息表/公开详情页展示，不在本 Tab 重复）；
  // 免费档显示「需升级」，会员打开即自动解锁。
  { key: "buyer", labelKey: "detail_tabBuyer", gate: { benefitCode: "notice_view" } },
  // 投标材料 = 中文拆解报告 + 原始招标文件（原「原始文件」Tab 扩容）
  { key: "files", labelKey: "detail_tabMaterials", gate: { benefitCode: "original_file_access" } },
  { key: "ai-score", labelKey: "detail_tabAiScore", gate: { benefitCode: "ai_match" } },
  // "history"（同类品类历史中标）已随旧品类码小表剥离整链下线（2026-10-14）：
  // bid_awards 的旧码列全表 0 行非空，该 Tab 自上线起恒为空态，属零数据空转
  { key: "similar", labelKey: "detail_tabSimilar", gate: { benefitCode: "similar_opportunity" } },
];

type RawAttachment = NoticeAttachment | string;

/** 附件 URL 兜底链（string 形态直接当 URL） */
export function attachmentUrl(item: RawAttachment): string | undefined {
  if (typeof item === "string") return item;
  return item.url || item.link || undefined;
}

/** 附件名兜底链 */
export function attachmentName(item: RawAttachment): string {
  if (typeof item === "string") return item;
  return item.name || item.title || item.label || item.url || item.link || "-";
}

/**
 * 拆解文件清单：documents + procurement_files 合并（服务端已归一为 documents
 * 单一事实源，procurement_files 仅兼容旧缓存 payload），按 url|name 去重。
 * 供「投标材料」Tab 与详情页拆解文件指示器共用同一口径。
 */
export function collectBreakdownFiles(notice: NoticeItem): RawAttachment[] {
  const documents = (notice.attachments as RawAttachment[] | undefined) || [];

  const seenFiles = new Set<string>();
  return [...documents].filter((item) => {
    if (!attachmentUrl(item) && attachmentName(item) === "-") return false;
    const key = `${attachmentUrl(item) || ""}|${attachmentName(item)}`.toLowerCase();
    if (seenFiles.has(key)) return false;
    seenFiles.add(key);
    return true;
  });
}

/** 门控状态 → 角标配色（按状态着色，随权益动态呈现，取代旧的静态档位配色）。 */
export const GATE_BADGE_STYLE: Record<GateState, string> = {
  free: "bg-teal-50 text-teal-700 border-teal-200",
  included: "bg-emerald-50 text-emerald-700 border-emerald-200",
  unlock: "bg-amber-50 text-amber-700 border-amber-200",
  upgrade: "bg-purple-50 text-purple-700 border-purple-200",
  contact: "bg-slate-100 text-slate-600 border-slate-200",
};

/** 门控状态 → i18n 文案键（free 复用既有 detail_free）。 */
export const GATE_LABEL_KEY: Record<GateState, string> = {
  free: "detail_free",
  included: "detail_gateIncluded",
  unlock: "detail_gateUnlock",
  upgrade: "detail_gateUpgrade",
  contact: "detail_gateContact",
};

/**
 * 计算某 Tab 对当前用户的门控状态。gates 来自服务端矩阵（/api/membership/status 下发），
 * 前端不复制档位常量；缺数据时保守回退 'upgrade'。
 */
export function deriveTabGateState(
  tab: DetailTab,
  gates: Record<string, GateState> | undefined,
): GateState {
  // 未挂权益的 Tab（公开信息）对所有人展示「免费」
  if (!tab.gate) return "free";
  return gates?.[tab.gate.benefitCode] ?? "upgrade";
}

/**
 * ARIA Tabs id 单一事实源（spec 2026-09-21）：Tab 条与内容区共用，
 * 保证 aria-controls / aria-labelledby 联动不断链。
 */
export const tabTriggerId = (key: string) => `detail-tab-${key}`;
export const tabPanelId = (key: string) => `detail-tabpanel-${key}`;
