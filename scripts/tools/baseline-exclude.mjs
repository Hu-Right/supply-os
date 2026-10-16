/**
 * 结构基线排除清单（纯模块，无副作用）：影子/备份/镜像表 → 不进 db/schema/baseline.sql。
 *
 * @script scripts/tools/baseline-exclude.mjs
 * @why    抽成纯函数是为了能被 node --test 直接自测（dump-schema-baseline.mjs import 即连库，
 *         无法在 CI/本地无库环境跑断言）。把「哪些后缀属临时物」这件事钉进可执行规格，
 *         杜绝影子表切换后漏改排除清单、把半成品结构写进基线（2026-10-12 机会表轮次踩过）。
 * @see    scripts/tools/dump-schema-baseline.mjs（消费方）、ADR-0003（蓝绿切换）、ADR-0014（落刀证明保留）
 */

// 影子/备份表（带 __bak_ 或日期后缀）是一次性切换留下的快照，不属于终态结构。
// __new 后缀是 ADR-0003 蓝绿切换的**在途影子表**：切换前重导会把半成品结构写进基线，
// 切换后它会原子改名成原表、自然消失，故必须排除（2026-10-12 机会表轮次踩过这个口）。
// __drill 后缀是全量对拍/回滚演练的影子表（如 crm_notice_attribution_nodes__drill），
// 它们按纪律保留作“落刀证明”（ADR-0014），同样不能进基线。
export const EXCLUDE_RES = [
  /__bak_/,
  /_bak\d/,
  /_(?:bak|backup|old|copy)_?\d*$/,
  /__new$/,
  /__drill$/,
  // 供应商退役批次的蓝绿影子/保留表：supplier__gs 在途影子、supplier__legacy 观察期保留、
  // supplier__gs_dropped 回滚残留——均为切换窗口内的临时物，不属于终态结构，不进基线。
  /__gs(_dropped)?$/,
  /__legacy$/,
  /_retired_/,
  // outreach 系为内网爬虫侧拥有的镜像表（列集合随爬虫源漂移，含 supplier 快照列），
  // 结构事实源在内网，不进本基线（旧字典零残留门禁对它的豁免口径见 check-legacy-dict-residue.mjs）。
  /^crm_outreach_/,
];

/** 是否属应排除的影子/备份/镜像表；extraRes 供 EXCLUDE 环境变量追加口径（与内置取并集）。 */
export function isExcludedTable(name, extraRes = []) {
  const res = extraRes.length ? [...EXCLUDE_RES, ...extraRes] : EXCLUDE_RES;
  return res.some((re) => re.test(name));
}
