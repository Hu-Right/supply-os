/**
 * 归属解析内核单测 —— 钉住"去补位匹配 + 仅 approved 可用 + 野码不猜 + 路径含全部祖先"。
 */
import { describe, expect, it } from "vitest";
import {
  buildXwalkIndex,
  resolveNoticeCodes,
  planNoticePath,
  type XwalkRow,
} from "@/lib/services/commodity/fusion-xwalk";

const rows: XwalkRow[] = [
  { node_code: "UGT-043", std: "unspsc", std_code: "10", status: "approved" },
  { node_code: "UGT-043115", std: "unspsc", std_code: "1001", status: "approved" },
  { node_code: "UGT-043115007", std: "unspsc", std_code: "10012005", status: "approved" },
  { node_code: "UGT-999999", std: "unspsc", std_code: "8090", status: "pending" }, // 未过审不可用
];
const { index, dup } = buildXwalkIndex(rows);

describe("buildXwalkIndex", () => {
  it("仅收 approved，dup=0", () => {
    expect(dup).toBe(0);
    expect(index.size).toBe(3);
    expect(index.has("unspsc:8090")).toBe(false); // pending 被排除
  });
});

describe("解析与匹配", () => {
  it("补位归一命中：100120 与 10012000 同 class sig 匹配到 UGT-043115", () => {
    // xwalk 存 "1001"(sig"1001")；公告若带 "10010000" 也归一 "1001" → 命中
    const r = resolveNoticeCodes([{ std: "unspsc", code: "10010000" }], index);
    expect(r.nodes).toEqual(["UGT-043115"]);
    expect(r.wild).toEqual([]);
  });
  it("非法码/pending 一律野码，不猜挂", () => {
    const r = resolveNoticeCodes(
      [{ std: "unspsc", code: "10002005" }, { std: "unspsc", code: "8090" }, { std: "unspsc", code: "zz" }],
      index,
    );
    expect(r.nodes).toEqual([]);
    expect(r.wild).toHaveLength(3);
  });
});

describe("planNoticePath 端到端", () => {
  it("命中商品码 → 展开含全部祖先、去重升序", () => {
    const p = planNoticePath([{ std: "unspsc", code: "10012005" }], index);
    expect(p.nodes).toEqual(["UGT-043115007"]);
    expect(p.path).toBe("UGT-043,UGT-043115,UGT-043115007");
  });
  it("多码去重同一祖先链（族+商品同挂 → 只一条链）", () => {
    const p = planNoticePath(
      [{ std: "unspsc", code: "1001" }, { std: "unspsc", code: "10012005" }],
      index,
    );
    expect(p.path).toBe("UGT-043,UGT-043115,UGT-043115007");
  });
  it("全换不出 → 空路径空节点（以树为准，不算错）", () => {
    const p = planNoticePath([{ std: "unspsc", code: "99999999" }], index);
    expect(p.path).toBe("");
    expect(p.nodes).toEqual([]);
    expect(p.wild).toEqual(["unspsc:99999999"]);
  });
});
