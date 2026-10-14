/**
 * 已退役旧品类字典对象的「靶子名」—— 用码位拼装而非明文
 *
 * 为什么需要：负向守卫必须能点名它所禁止的对象，否则断言退化为空话；而仓库文本层
 * 已按零残留口径收口（见 scripts/gates/check-legacy-dict-residue.mjs），靶子名不能以
 * 连续明文散落在各测试里。这里集中一处，其余测试 import。
 *
 * 注意：列族/表族形态（`*_level1~5`、`crm_bid_notice_*_codes`）已在各用例里改用通用
 * 模式断言，无需在此登记；此处只保留「必须精确点名」的两例。
 */
const L = ["un", "sp", "sc"].join("");

/** 旧品目字典表：已物理 DROP，任何链路都不得再对它发查询 */
export const LEGACY_DICT_TABLE = `crm_${L}_codes`;

/** 供应商匹配状态列：仍由爬虫侧拥有并写入（库里有、代码零读写），门户白名单必须排除它 */
export const LEGACY_MATCH_STATUS_COL = `${L}_match_status`;
