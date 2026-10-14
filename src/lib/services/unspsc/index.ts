/**
 * UNSPSC 服务模块 — 统一导出入口
 * UNSPSC service module — unified export entry
 *
 * @module server/services/unspsc
 * @description 按职责拆分的 UNSPSC 子模块统一导出：
 *              - parser: 纯函数（码归一化、前缀提取）
 *              - bridge-normalize: 纯函数（桥表入库五级路径归一）
 *              - bridge-derive: 纯函数（按主表码文本派生桥表新行）
 *              - opp-bridge: 数据库写操作（商机桥表补行）
 *              - interest: 数据库写操作（用户兴趣码持久化）
 *              （filter 已整文件下线：最后一个读者随 UNSPSC 字典退役删除）
 */

// 纯函数（padUnspscPrefix 已随 R3' B3 删除；expandUnspscInterestPrefixes 已随
// 小表剥离删除——兴趣画像改吃 UGT 节点码，前缀展开失零读者）
export {
  normalizeUnspscCodes,
  unspscPrefixFromCode,
} from "./parser";
export type { UnspscCodeRow } from "./parser";

// 桥表入库归一（纯函数）
export {
  BRIDGE_PATH_COLUMNS,
  BRIDGE_NORMALIZE_POLICIES,
  buildUnspscDictIndex,
  normalizeBridgePathRow,
  applyBridgeNormalize,
  toDictIdOrNull,
} from "./bridge-normalize";
export type {
  BridgePathColumn,
  BridgeNormalizePolicy,
  BridgeNormalizeResult,
  UnspscDictIndex,
  UnspscDictRow,
} from "./bridge-normalize";

// 桥表派生与补行
export {
  extractFullCodes,
  deriveBridgeRows,
  type DerivedBridgeRow,
  type DeriveResult,
} from "./bridge-derive";
export {
  OPP_BRIDGE_TABLE,
  collectOppBridgePlan,
  insertOppBridgeRows,
  syncMissingOppBridge,
  type OppBridgeInsertRow,
  type OppBridgePlan,
  type OppBridgeSyncResult,
} from "./opp-bridge";

// SQL 构建（buildNoticeUnspscFilter 已随 R3' 断读者删除；getUnspscPath 的最后读者
// catalog.repo.findUnspscNodeById 链已随 UNSPSC 字典退役删除，filter.ts 整文件下线）

// 数据库写操作
// （interest.ts 已随小表剥离删除：兴趣画像改吃 UGT 节点码，
//   写入口收敛到 services/commodity/interest.ts persistInterestNodeCodes）
