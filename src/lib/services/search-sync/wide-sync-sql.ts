/**
 * 宽表同步 SQL 片段（叶子模块，无内部依赖）
 * Wide Sync SQL Fragments (dependency leaf)
 *
 * @module server/services/search-sync/wide-sync-sql
 * @description 单独成文件的原因不是整洁，而是**打断循环依赖**：
 *              wide-row-builder 需要 wide-fingerprint 的 WIDE_FP_EXPR（拼进 SELECT），
 *              而 wide-fingerprint 的漂移检测又需要同一份机会表 JOIN 片段。
 *              若 JOIN 留在 builder 里，就形成 builder ↔ fingerprint 双向 import，
 *              Node ESM 下会因求值顺序触发
 *              「Cannot access 'WIDE_FP_EXPR' before initialization」（2026-09-20 真实库
 *              收敛验证时暴露，单测因入口顺序不同而侥幸不报）。
 *              本模块只依赖 utils 层常量，两侧都从它导入，环消失。
 */
import { qualifiedOppWhere } from "../../utils/notice-qualified";

/** 机会表合格行 JOIN 片段（别名 opp），供宽表主查询、翻译批量查询与指纹检测共用；
 *  谓词由 utils/notice-qualified 唯一派生，与精选判定同口径（I2） */
export const WIDE_OPP_JOIN = `
  LEFT JOIN crm_bid_opportunities opp ON opp.source_notice_id = n.notice_id
    AND ${qualifiedOppWhere("opp")}
`;

/** 宽表主查询 FROM + JOIN（依赖别名 n = crm_bid_notices） */
export const WIDE_SYNC_JOIN = `
  FROM crm_bid_notices n
  ${WIDE_OPP_JOIN}
`;
