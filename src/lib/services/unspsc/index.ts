/**
 * UNSPSC 服务模块 — 统一导出入口
 * UNSPSC service module — unified export entry
 *
 * @module server/services/unspsc
 * @description 仅剩 parser 纯函数（normalizeUnspscCodes 供中标报告等读主表
 *              unspsc_codes JSON 的残留消费方使用；unspscPrefixFromCode 供
 *              上线日迁移件使用）。
 *
 *              已随退役删除的子模块（按批次）：
 *              - filter（R3' 断读者 + 字典退役）、interest / 桥表三件
 *                bridge-normalize / bridge-derive / opp-bridge（小表剥离 +
 *                桥表直删 2026-10-14：桥表移出同步清单，公告归属唯一事实源
 *                是落点表，见 services/commodity/attribution-mirror）。
 */
export {
  normalizeUnspscCodes,
  unspscPrefixFromCode,
} from "./parser";
export type { UnspscCodeRow } from "./parser";
