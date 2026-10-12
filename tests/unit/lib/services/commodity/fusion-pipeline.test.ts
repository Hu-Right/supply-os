/**
 * 融合树端到端流水线集成测试 —— 把三个内核串成一条链自证协同（纯内存，零现网/零伪造数据）。
 * 覆盖：建树→边校验清白→xwalk 索引→公告码解析→路径列值；并注入"牛头不对马嘴"与"跨标准"两种边，
 * 验证前者必 fatal（护栏有牙）、后者路由 human 不误拒。
 */
import { describe, expect, it } from "vitest";
import { collectEdgeViolations, hasFatal, type FusionRow } from "@/lib/services/commodity/fusion-tree";
import { buildXwalkIndex, planNoticePath, type XwalkRow } from "@/lib/services/commodity/fusion-xwalk";

// 一条合法 UNSPSC 主轴链：段10 → 族1001 → 商品10012005
const tree: FusionRow[] = [
  { code: "UGT-043", parent_code: "", level: 1, group_code: "UGT-G-07", axis_std: "unspsc", axis_code: "10" },
  { code: "UGT-043115", parent_code: "UGT-043", level: 2, group_code: "UGT-G-07", axis_std: "unspsc", axis_code: "1001" },
  { code: "UGT-043115007", parent_code: "UGT-043115", level: 3, group_code: "UGT-G-07", axis_std: "unspsc", axis_code: "10012005" },
];

const xwalk: XwalkRow[] = [
  { node_code: "UGT-043", std: "unspsc", std_code: "10", status: "approved" },
  { node_code: "UGT-043115", std: "unspsc", std_code: "1001", status: "approved" },
  { node_code: "UGT-043115007", std: "unspsc", std_code: "10012005", status: "approved" },
];

describe("融合流水线：建树 → 校验 → 归属 → 路径", () => {
  it("合法树：边清白、无 fatal", () => {
    const viol = collectEdgeViolations(tree);
    expect(hasFatal(viol)).toBe(false);
    expect(viol).toHaveLength(0);
  });

  it("公告带商品码 → 解析出最深落点 + 含全部祖先的路径", () => {
    const { index } = buildXwalkIndex(xwalk);
    const plan = planNoticePath([{ std: "unspsc", code: "10012005" }], index);
    expect(plan.nodes).toEqual(["UGT-043115007"]);
    expect(plan.path).toBe("UGT-043,UGT-043115,UGT-043115007");
  });

  it("护栏有牙：注入'牛头不对马嘴'（子 axis 跳出父段）必被判 fatal", () => {
    const broken: FusionRow[] = [
      tree[0],
      { ...tree[1], axis_code: "2001" }, // 父段10，子却跳到段20 → 单调破坏
    ];
    const viol = collectEdgeViolations(broken);
    expect(hasFatal(viol)).toBe(true);
    expect(viol.find((v) => v.code === "UGT-043115")!.fatal.join()).toMatch(/单调归属破坏/);
  });

  it("跨标准边不误拒：路由 human，不算 fatal", () => {
    const cross: FusionRow[] = [
      tree[0],
      { ...tree[1], axis_std: "hs", axis_code: "0101" },
    ];
    const viol = collectEdgeViolations(cross);
    expect(hasFatal(viol)).toBe(false);
    expect(viol.find((v) => v.code === "UGT-043115")!.human.join()).toMatch(/跨标准挂载/);
  });

  it("野码不猜挂：未入 approved 账本的码进 wild、不进路径", () => {
    const { index } = buildXwalkIndex(xwalk);
    const plan = planNoticePath([{ std: "unspsc", code: "99999999" }], index);
    expect(plan.path).toBe("");
    expect(plan.wild).toEqual(["unspsc:99999999"]);
  });
});
