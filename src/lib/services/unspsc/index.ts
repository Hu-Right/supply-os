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
 *              - filter: SQL 构建（筛选器/降级路径查询）
 *              - interest: 数据库写操作（用户兴趣码持久化）
 */

// 纯函数（padUnspscPrefix 已随 R3' B3 删除：字典反查摘除后生产读者归零）
export {
  normalizeUnspscCodes,
  unspscPrefixFromCode,
  expandUnspscInterestPrefixes,
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

// SQL 构建（buildNoticeUnspscFilter 已随 R3' 断读者删除：全仓零调用者）
export {
  getUnspscPath,
} from "./filter";

// 数据库写操作
export {
  persistUserInterestCodes,
} from "./interest";
