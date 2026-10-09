/**
 * 品目树重排纯函数测试 — 影子表构建的内核，写库前先离线校验
 * @module tests/unit/lib/services/commodity-renumber.test.ts
 */
import { describe, it, expect } from "vitest";
import { renumberCommodityTree, seedNameZh, type FlatNode } from "@/lib/services/commodity-renumber";

// 构造一棵 2 板块的样例树（字段用旧表语义：code=UGT-C-+8位、src_code、parent_code）
const flat: FlatNode[] = [
  { id: 1, oldCode: "UGT-C-10000000", srcCode: "10000000", level: "segment", parentCode: null, nameZh: null },
  { id: 2, oldCode: "UGT-C-10100000", srcCode: "10100000", level: "family", parentCode: "UGT-C-10000000", nameZh: null },
  { id: 3, oldCode: "UGT-C-10101500", srcCode: "10101500", level: "class", parentCode: "UGT-C-10100000", nameZh: null },
  { id: 4, oldCode: "UGT-C-10101501", srcCode: "10101501", level: "commodity", parentCode: "UGT-C-10101500", nameZh: null },
  { id: 5, oldCode: "UGT-C-10101504", srcCode: "10101504", level: "commodity", parentCode: "UGT-C-10101500", nameZh: null },
  { id: 6, oldCode: "UGT-C-11000000", srcCode: "11000000", level: "segment", parentCode: null, nameZh: null },
];

describe("renumberCommodityTree", () => {
  it("每父下从 01 顺排、码长即层级、父指针指向新码", () => {
    const out = renumberCommodityTree(flat);
    const byId = new Map(out.map((r) => [r.id, r]));
    expect(byId.get(1)!.code).toBe("UGT-C-01");
    expect(byId.get(2)!.code).toBe("UGT-C-0101");
    expect(byId.get(3)!.code).toBe("UGT-C-010101");
    expect(byId.get(4)!.code).toBe("UGT-C-01010101");
    expect(byId.get(5)!.code).toBe("UGT-C-01010102"); // 稀疏 04 → 压缩为 02
    expect(byId.get(6)!.code).toBe("UGT-C-02");
    expect(byId.get(5)!.parentCode).toBe("UGT-C-010101");
    expect(byId.get(1)!.parentCode).toBeNull();
    expect(byId.get(4)!.unspscCode).toBe("10101501"); // 原码迁移到 unspsc_code
  });

  it("全部新码唯一且父码=子码去末两级", () => {
    const out = renumberCommodityTree(flat);
    expect(new Set(out.map((r) => r.code)).size).toBe(out.length);
    for (const r of out) {
      if (r.level !== "segment") {
        expect(r.parentCode).toBe(r.code.slice(0, r.code.length - 2));
      }
    }
  });

  it("同父子节点按原 src_code 升序排（稳定可复现）", () => {
    const out = renumberCommodityTree(flat);
    const order = out.filter((r) => r.parentCode === "UGT-C-010101").map((r) => r.code);
    expect(order).toEqual(["UGT-C-01010101", "UGT-C-01010102"]);
  });
});

describe("seedNameZh", () => {
  it("按 src_code 从旧字典回灌中文，仅填空缺、不覆盖已有", () => {
    const rows = [
      { srcCode: "10101501", nameZh: null },
      { srcCode: "10101504", nameZh: "已有貂名" },
    ];
    const seed = new Map([["10101501", "猫"], ["10101504", "水貂"]]);
    const out = seedNameZh(rows, seed);
    expect(out[0].nameZh).toBe("猫");
    expect(out[1].nameZh).toBe("已有貂名"); // 不被覆盖
  });

  it("seed 未命中的空缺保持为空", () => {
    const out = seedNameZh([{ srcCode: "99999999", nameZh: null }], new Map([["10101501", "猫"]]));
    expect(out[0].nameZh).toBeNull();
  });
});
