/**
 * 骨架节点码形制 — 全库唯一实现（纯函数，无依赖）
 * Commodity backbone node code shape (SSOT)
 *
 * @module shared/constants/commodity-code
 * @description 2026-10 分层治理：本层原驻 `lib/services/commodity/backbone-path.ts` /
 *              `tree.ts`，但 features 客户端组件（五级级联、热门大类过滤）需要同一
 *              形制判定，而红线 3 禁止 features import `@/lib/**`。码形判定是纯数据
 *              规则而非服务端能力，按红线 1 的通道（lib 允许 import shared/constants）
 *              下沉到这里：lib 侧 backbone-path / tree 改为再导出（shim），
 *              features 侧直引本模块——实现仍只有一份。
 *
 *              树形不变量（门禁 BB1 钉住）：码长即层级（2/4/6/8/10 位数字），
 *              父码 = 自身码去掉末两位 ⇒ 祖先链纯切片零查库。
 *              形制不符一律返回 0/空（调用方据此拒收，不猜、不 trim 放脏码进门）。
 */

/** 骨架节点码前缀：`crm_commodity_backbone.code` 的形制 */
export const BACKBONE_NODE_PREFIX = "UGT-";

/** 节点码形制：前缀 + 2/4/6/8/10 位数字（奇数位一律不认） */
const NODE_RE = new RegExp(`^${BACKBONE_NODE_PREFIX}\\d{2}(\\d{2}){0,4}$`);

/**
 * 骨架节点码 → 层级（1~5）；形制不符返回 0（调用方据此拒收，不猜层级）。
 * 全库只这一份形制判定。曾经有过只判 `startsWith` 的写法，那会把 `UGT-XY` 这种
 * 脏 token 当成合法层级使 —— 两个同样的脏码直接得高分，就能出一条不存在的相似公告。
 * 故意不 trim：脏入参（URL 参数带空格、列里混进空白）宁可判非法 —— 契约就是
 * 「形制不符不点亮」，这里多一次 trim 就会把脏键放进来。
 */
export function backboneNodeLevel(node: unknown): number {
  const v = typeof node === "string" ? node : "";
  if (!NODE_RE.test(v)) return 0;
  return (v.length - BACKBONE_NODE_PREFIX.length) / 2;
}

/**
 * 是否为合法骨架节点筛选键（`UGT-` + 2/4/6/8/10 位数字，奇数位一律不认）。
 * （原 tree.ts 的 isCommodityNodeKey，形制判定本就直引 backbone-path，这里收编为导出本体）
 */
export function isCommodityNodeKey(value: unknown): value is string {
  return backboneNodeLevel(value) > 0;
}

/**
 * 旧码制兼容归一（仅入口层用）：2026-10-13 前品目树码带面别字（`UGT-B-…`），存量外链
 * （`?commodity=` / `?code=` / `?parent=`）可能仍带旧形，入口归一成现行码再走形制判定。
 * 库列解析（`fromBackbonePathColumn`）**不走这里**——列形制已随数据迁移只有一种，
 * 宽解析反会把脏 token 放进来（见 backboneNodeLevel 的不 trim 理由）。
 */
export function normalizeBackboneNodeKey(v: unknown): string {
  const s = String(v ?? "");
  return s.startsWith("UGT-B-") ? BACKBONE_NODE_PREFIX + s.slice(6) : s;
}

/**
 * 骨架节点码 → 自身 + 全部祖先，浅→深。
 * 为什么能纯切片不回表：门禁 BB1 把「父码 = 自身码去掉末两位」钉成不变量。
 * 形制不符返回空数组（调用方据此拒写），不返回半条链。
 */
export function chainOfNode(node: unknown): string[] {
  const v = String(node ?? "").trim();
  if (backboneNodeLevel(v) === 0) return [];
  const body = v.slice(BACKBONE_NODE_PREFIX.length);
  const out: string[] = [];
  for (let len = 2; len <= body.length; len += 2) out.push(BACKBONE_NODE_PREFIX + body.slice(0, len));
  return out;
}

/** 节点码 → 层级（1~5）；非法键返回 0（调用方据此拒绝下钻，不猜层级） */
export function commodityNodeLevel(code: string): number {
  return backboneNodeLevel(code);
}

/**
 * 节点码 → 它的整条祖先链 [L1, L2, L3, L4, L5]（未选到的层为空串）。
 * 截断不在这里重写：直接用 chainOfNode，这里只补成五级定长形状。
 * 换算规则只能有一份实现——两份就会分开错，而公告侧列值也按那一份算。
 */
export function commodityNodeChain(value: string | null | undefined): [string, string, string, string, string] {
  const chain = chainOfNode(value);
  const out: [string, string, string, string, string] = ["", "", "", "", ""];
  for (let i = 0; i < chain.length; i++) out[i] = chain[i];
  return out;
}

/**
 * 节点码 → 所属大类（L1 树码，如 `UGT-010203 → UGT-01`）。G 码退役后大类身份即 L1 码，
 * 纯切片零查库；非法键返回空串（调用方按「无大类」处理，不猜）。
 */
export function l1CodeOfNode(value: string | null | undefined): string {
  return commodityNodeChain(value)[0];
}
