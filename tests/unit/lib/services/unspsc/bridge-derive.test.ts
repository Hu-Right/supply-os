/**
 * UNSPSC 桥表派生（主表码文本 → 桥表新行）—— 纯函数单测
 *
 * 钉住三条口径（2026-10-10 商机桥表断供治理时实测现网形态固化）：
 *   1. 只认 8 位全码：主表 product_code 脏值与 unspsc_codes 描述文本里嵌的码都能抽出，
 *      但 2/4/6 位短码一律不认（它们要靠补零才成 8 位，猜不得）；
 *   2. 闸口与入库归一同口径：码不在旧字典 → 不写；父链回溯不出 level1 → 不写（写了行业墙也看不到）；
 *   3. 空值与值类型按目标表 policy 收敛：商机桥表 varchar 列 + 空串，公告桥表 int 列 + NULL。
 */
import { describe, it, expect } from "vitest";
import { BRIDGE_NORMALIZE_POLICIES, buildUnspscDictIndex, type UnspscDictRow } from "@/lib/services/unspsc/bridge-normalize";
import { deriveBridgeRows, extractFullCodes } from "@/lib/services/unspsc/bridge-derive";

/** 与 bridge-normalize 单测同构的字典夹具：字母大类 + 8 位码各层 + 孪生节点 */
const DICT_ROWS: UnspscDictRow[] = [
  { id: 103, code: "D", level: 1, parent_id: 0 },
  { id: 106, code: "G", level: 1, parent_id: 0 },
  { id: 109, code: "J", level: 1, parent_id: 0 },
  { id: 107363, code: "80000000", level: 2, parent_id: 109 },
  { id: 107364, code: "80100000", level: 3, parent_id: 107363 },
  { id: 108670, code: "80101500", level: 4, parent_id: 107364 },
  // 孪生节点：同码挂在另一分支（派生必须取有序列表的首个，不得乱挑）
  { id: 900000, code: "80101500", level: 4, parent_id: 777777 },
  { id: 777777, code: "70000000", level: 2, parent_id: 106 },
  { id: 104789, code: "43000000", level: 2, parent_id: 106 },
  { id: 117411, code: "43220000", level: 3, parent_id: 104789 },
  { id: 111014, code: "43221500", level: 4, parent_id: 117411 },
];
const dict = buildUnspscDictIndex(DICT_ROWS);

const OPPORTUNITY = BRIDGE_NORMALIZE_POLICIES.crm_bid_opportunity_unspsc_codes;
const NOTICE = BRIDGE_NORMALIZE_POLICIES.crm_bid_notice_unspsc_codes;

describe("extractFullCodes · 只认 8 位全码", () => {
  it("干净码直取；脏文本里嵌的码也能抽出", () => {
    expect(extractFullCodes("47101501")).toEqual(["47101501"]);
    expect(extractFullCodes("39122100（主分类：Kasten柜子）；辅助分类：44421300（Kluizen保险柜）")).toEqual(["39122100", "44421300"]);
  });

  it("短码不认：2/4/6 位前缀一律丢弃（不靠补零猜全码）", () => {
    expect(extractFullCodes("308440")).toEqual([]);
    expect(extractFullCodes("43 / 4322 / 432215")).toEqual([]);
  });

  it("无码文本与空值返回空数组；JSON 列原文与对象都支持", () => {
    expect(extractFullCodes("未提供 — 原文档未标注", null, undefined, "")).toEqual([]);
    expect(extractFullCodes(null, [{ code: "10101500", name: "" }])).toEqual(["10101500"]);
    expect(extractFullCodes(null, '[{"code":"10101500"},{"code":"49221500"}]')).toEqual(["10101500", "49221500"]);
  });

  it("跨来源合并并去重（product_code 与 JSON 列给同一个码时只留一份）", () => {
    expect(extractFullCodes("10101500", "10101500 和 49221500 以及 10101500")).toEqual(["10101500", "49221500"]);
  });
});

describe("deriveBridgeRows · 商机桥表口径（varchar 列 + 空串）", () => {
  it("码在字典 → 由父链派生五级路径，本层填自身、更深层留空串", () => {
    const { rows, skippedNotInDict, skippedNoPath } = deriveBridgeRows(["80101500"], dict, OPPORTUNITY);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      code: "80101500",
      codeId: 108670,
      level: 4,
      path: { level1_id: "109", level2_id: "107363", level3_id: "107364", level4_id: "108670", level5_id: "" },
    });
    expect(skippedNotInDict).toBe(0);
    expect(skippedNoPath).toBe(0);
  });

  it("段/族级粗码：只填到它所在层，其余为空串（level 取节点自身层级）", () => {
    const { rows } = deriveBridgeRows(["43000000"], dict, OPPORTUNITY);
    expect(rows[0].level).toBe(2);
    expect(rows[0].path).toEqual({ level1_id: "106", level2_id: "104789", level3_id: "", level4_id: "", level5_id: "" });
  });

  it("闸口 1：码不在旧字典 → 不写行，计入 skippedNotInDict", () => {
    const { rows, skippedNotInDict } = deriveBridgeRows(["99999999"], dict, OPPORTUNITY);
    expect(rows).toEqual([]);
    expect(skippedNotInDict).toBe(1);
  });

  it("孪生节点取有序列表首个，与入库归一的缺省起点一致", () => {
    const { rows } = deriveBridgeRows(["80101500"], dict, OPPORTUNITY);
    expect(rows[0].codeId).toBe(dict.idsForCode("80101500")[0]);
  });

  it("多码混合：命中的写行、未命中的计数，互不干扰", () => {
    const { rows, skippedNotInDict } = deriveBridgeRows(["99999999", "80101500", "43221500"], dict, OPPORTUNITY);
    expect(rows.map((r) => r.code)).toEqual(["80101500", "43221500"]);
    expect(skippedNotInDict).toBe(1);
  });
});

describe("deriveBridgeRows · 公告桥表口径（int 列 + NULL）", () => {
  it("同一条码换目标表：值为 number、空层为 null", () => {
    const { rows } = deriveBridgeRows(["43221500"], dict, NOTICE);
    expect(rows[0].path).toEqual({ level1_id: 106, level2_id: 104789, level3_id: 117411, level4_id: 111014, level5_id: null });
  });
});
