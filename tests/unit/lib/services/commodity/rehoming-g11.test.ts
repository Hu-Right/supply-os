/**
 * 品目树 01 类归位规格 + 纯重排函数单测
 *
 * 钉住的四件事（都是「做错了界面照样跑、数据却静默坏掉」的类型）：
 * 1. **一个不多一个不少**：规格里认领的 6 位类必须与现树 57 个子类逐一对上（CG-i/CG-j），
 *    少一个 = 那个节点的公告在新树里永远筛不到；多一个 = 造了库里不存在的码。
 * 2. **族不跨中类**（BB3 镜像）：族级粗码实测挂着 13,601 条公告，落点必须唯一可证。
 * 3. **码路径自洽**（BB1 镜像）：码长即层级、parent_code 必须等于自身去末两级，
 *    否则 backbone_path 的「祖先全存」不变量破，读侧点查父链会掉进不存在的码。
 * 4. **不许回潮贪心取名**：多成员小类的名字不得照抄其某个子类 —— 旧树 89.7% 的小类因此名实不符，
 *    这是本次归位要修的原罪，规格一旦把它重新引入必须立刻红。
 */
import { describe, expect, it } from "vitest";
import {
  G11_REHOMING,
  REHOME_GROUP_CODE,
  REHOME_L1_CODE,
  auditBusinessLayer,
  rebuildG11Subtree,
  validateRehomeSpec,
  type BackboneRow,
} from "@/lib/services/commodity/rehoming-g11";

/** 规格声明的全部 6 位类（顺序按码排序，与现树排序口径一致） */
const ALL_CLASS_PREFIXES = G11_REHOMING.flatMap((l2) => l2.l3.flatMap((l3) => l3.classes)).sort();

const row = (
  code: string,
  parentCode: string,
  level: number,
  groupCode: string,
  nameZh: string,
  unspscPrefix: string | null = null,
): BackboneRow => ({
  code, parentCode, level, groupCode, unspscPrefix,
  nameZh, nameEn: "", sort: 1, status: 1, note: "",
});

/**
 * 造一棵「旧结构形状」的 01 子树：3 个中类 + 每 8 个子类切一个小类 + 小类名照抄块内第一子类。
 * 故意复刻旧树的两个病灶（定长分块、贪心取名），用来验证归位函数会把它们全部改掉。
 * L4 名字用「类<码>」形式，以便破坏样本能真的复现「父名=子名」。
 */
function fakeOldTree(): BackboneRow[] {
  const rows: BackboneRow[] = [row(REHOME_L1_CODE, "", 1, REHOME_GROUP_CODE, "建筑施工与运维服务")];
  const famOf = (p: string) => p.slice(0, 4);
  const l2OfFam = (fam: string) => (fam === "7214" ? 2 : fam === "7210" ? 3 : 1);
  const l3SeqByL2 = new Map<number, number>();
  for (let i = 0; i < ALL_CLASS_PREFIXES.length; i += 8) {
    const chunk = ALL_CLASS_PREFIXES.slice(i, i + 8);
    const l2Seq = l2OfFam(famOf(chunk[0]!));
    const l2Code = `${REHOME_L1_CODE}${String(l2Seq).padStart(2, "0")}`;
    if (!rows.some((r) => r.code === l2Code)) rows.push(row(l2Code, REHOME_L1_CODE, 2, REHOME_GROUP_CODE, `旧中类${l2Seq}`));
    const l3Seq = (l3SeqByL2.get(l2Seq) ?? 0) + 1;
    l3SeqByL2.set(l2Seq, l3Seq);
    const l3Code = `${l2Code}${String(l3Seq).padStart(2, "0")}`;
    rows.push(row(l3Code, l2Code, 3, REHOME_GROUP_CODE, `类${chunk[0]!}`)); // 贪心取名：拿块内第一个子类的名字当父名
    chunk.forEach((p6, idx) => {
      const l4Code = `${l3Code}${String(idx + 1).padStart(2, "0")}`;
      rows.push(row(l4Code, l3Code, 4, REHOME_GROUP_CODE, `类${p6}`, p6));
      for (let k = 1; k <= 2; k += 1) {
        rows.push(row(`${l4Code}${String(k).padStart(2, "0")}`, l4Code, 5, REHOME_GROUP_CODE, `品目${p6}-${k}`, `${p6}${String(k).padStart(2, "0")}`));
      }
    });
  }
  return rows;
}

/** 别的抽屉：必须原样透传，一行都不许动 */
function foreignTree(): BackboneRow[] {
  return [
    row("UGT-B-08", "", 1, "UGT-G-12", "清洁环境与设施维护"),
    row("UGT-B-0801", "UGT-B-08", 2, "UGT-G-12", "清洁和看管服务"),
    row("UGT-B-080101", "UGT-B-0801", 3, "UGT-G-12", "一般建筑物、办公室清洁和维护服务"),
    row("UGT-B-08010101", "UGT-B-080101", 4, "UGT-G-12", "建筑物清洁服务", "761110"),
    row("UGT-B-0801010101", "UGT-B-08010101", 5, "UGT-G-12", "一般清洁", "76111001"),
  ];
}

describe("归位规格自洽（CG1~CG7）", () => {
  it("成员数与现树完全对齐，且无重复认领", () => {
    expect(validateRehomeSpec(fakeOldTree())).toEqual([]);
    expect(ALL_CLASS_PREFIXES.length).toBe(57);
    expect(new Set(ALL_CLASS_PREFIXES).size).toBe(57);
  });

  it("现树少一个子类就红（少一个 = 该节点公告永远筛不到）", () => {
    const broken = fakeOldTree().filter((r) => r.unspscPrefix !== "721546");
    expect(validateRehomeSpec(broken).join(" ")).toContain("721546");
  });

  it("规格认领了现树不存在的码就红（防造码）", () => {
    const bad = G11_REHOMING.map((l2, i) => (i === 0 ? { ...l2, l3: [...l2.l3, { seq: l2.l3.length + 1, nameZh: "幽灵桶", classes: ["729999"], basis: "" }] } : l2));
    expect(validateRehomeSpec(fakeOldTree(), bad).join(" ")).toContain("729999");
  });

  it("同一个类被两个抽屉认领就红（一个码只能有一个爹）", () => {
    const bad = G11_REHOMING.map((l2) => ({ ...l2, l3: l2.l3.map((l3) => ({ ...l3, classes: [...l3.classes] })) }));
    bad[2].l3[0].classes.push("721015"); // 把 7210 的类塞进 7215 的中类：既重复又跨族
    const msg = validateRehomeSpec(fakeOldTree(), bad).join(" ");
    expect(msg).toContain("721015");
  });

  it("含糊名「等」一律禁止（门禁 BB5 会直接红）", () => {
    const flat = G11_REHOMING.flatMap((l2) => [l2.nameZh, ...l2.l3.map((l3) => l3.nameZh)]);
    expect(flat.filter((n) => n.includes("等"))).toEqual([]);
    expect(flat.filter((n) => !n.trim())).toEqual([]);
  });

  it("族不跨中类（BB3 镜像：族粗码落点必须唯一）", () => {
    const famToL2 = new Map<string, number>();
    for (const l2 of G11_REHOMING) for (const fam of l2.families) famToL2.set(fam, l2.seq);
    expect(famToL2.size).toBe(5); // 72 段实测族：7210/7211/7212/7214/7215
    for (const l2 of G11_REHOMING) {
      for (const l3 of l2.l3) {
        for (const p of l3.classes) expect(famToL2.get(p.slice(0, 4))).toBe(l2.seq);
      }
    }
  });
});

describe("重排产物（RH 系列）", () => {
  const out = rebuildG11Subtree([...fakeOldTree(), ...foreignTree()]);

  it("结构判据全绿，且大类行原样透传", () => {
    expect(out.problems).toEqual([]);
    const l1 = out.rows.find((r) => r.level === 1)!;
    expect(l1.code).toBe(REHOME_L1_CODE);
    expect(l1.parentCode).toBe("");
    expect(out.rows.filter((r) => r.groupCode !== REHOME_GROUP_CODE)).toEqual([]);
  });

  it("数量守恒：子类与品目一行不少（旧 3 中类→新 4 中类，子类/品目不动身份）", () => {
    const old = fakeOldTree();
    expect(out.rows.filter((r) => r.level === 4).length).toBe(old.filter((r) => r.level === 4).length);
    expect(out.rows.filter((r) => r.level === 5).length).toBe(old.filter((r) => r.level === 5).length);
    expect(out.rows.filter((r) => r.level === 2).length).toBe(4);
    expect(out.rows.filter((r) => r.level === 3).length).toBe(30);
  });

  it("码长即层级、parent 等于自身去末两级、码唯一（BB1 镜像）", () => {
    const codes = new Set(out.rows.map((r) => r.code));
    expect(codes.size).toBe(out.rows.length);
    for (const r of out.rows) {
      expect(r.code.length).toBe(6 + r.level * 2);
      if (r.level > 1) {
        expect(r.parentCode).toBe(r.code.slice(0, -2));
        expect(codes.has(r.parentCode)).toBe(true);
      }
    }
  });

  it("每个 UNSPSC 码仍然只有一个爹", () => {
    const seen = new Map<string, string>();
    for (const r of out.rows.filter((x) => x.unspscPrefix)) {
      expect(seen.has(r.unspscPrefix!)).toBe(false);
      seen.set(r.unspscPrefix!, r.code);
    }
    expect(seen.size).toBe(out.rows.filter((x) => x.unspscPrefix).length);
  });

  it("旧树病灶逐条纠正：错挂的类回到语义抽屉", () => {
    const nameOfPrefix = (p: string) => {
      const l4 = out.rows.find((r) => r.level === 4 && r.unspscPrefix === p)!;
      const l3 = out.rows.find((r) => r.code === l4.parentCode)!;
      const l2 = out.rows.find((r) => r.code === l3.parentCode)!;
      return { l2: l2.nameZh, l3: l3.nameZh };
    };
    // 旧：721543 发电设备维保挂在「动物栖息地、动物笼舍」下
    expect(nameOfPrefix("721543").l3).toBe("建筑电气与发电设备服务");
    // 旧：721518 机器安装维保挂在「石砌和石雕服务」下
    expect(nameOfPrefix("721518").l3).toBe("专业设备安装与维保");
    // 旧：721515/721517 电气与安防挂在「暖通空调安装和维护服务」下
    expect(nameOfPrefix("721515").l3).toBe("建筑电气与发电设备服务");
    expect(nameOfPrefix("721517").l3).toBe("通信安防与自动化控制系统");
    // 旧：721520/721525 抹灰与地板挂在「石砌和石雕服务」下
    expect(nameOfPrefix("721520").l3).toBe("装饰装修与墙面地面工程");
    expect(nameOfPrefix("721525").l3).toBe("装饰装修与墙面地面工程");
    // 旧：住宅施工 721110/721111 挂在「工业厂房施工服务」下
    expect(nameOfPrefix("721110").l3).toBe("住宅建筑施工");
    expect(nameOfPrefix("721111").l3).toBe("住宅建筑施工");
    // 旧：混凝土/结构钢挂在「涂层、填缝、防雨和防火服务」下
    expect(nameOfPrefix("721527").l3).toBe("结构钢混凝土与屋面围护");
    expect(nameOfPrefix("721529").l3).toBe("结构钢混凝土与屋面围护");
    // 中类层：7210 独立成「建筑与设施维护修理」，不再与 7215 并桶
    expect(nameOfPrefix("721015").l2).toBe("建筑与设施维护修理");
    expect(nameOfPrefix("721540").l2).toBe("建筑专业分包与安装维保");
    expect(nameOfPrefix("721411").l2).toBe("市政与重型工程施工");
    expect(nameOfPrefix("721214").l2).toBe("房屋建筑施工");
  });

  it("小类名不得照抄子类名（贪心取名回潮会被 RH-3 拦住）", () => {
    for (const l3 of out.rows.filter((r) => r.level === 3)) {
      const kids = out.rows.filter((r) => r.level === 4 && r.parentCode === l3.code);
      if (kids.length > 1) expect(kids.some((k) => k.nameZh === l3.nameZh)).toBe(false);
    }
    // 反向验证断言有牙：把某个多成员小类改名成它的子类名，必须红
    const bad = G11_REHOMING.map((l2) => ({ ...l2, l3: l2.l3.map((l3) => ({ ...l3, classes: [...l3.classes] })) }));
    const target = bad[2].l3[4]; // 装饰装修与墙面地面工程（多成员）
    target.nameZh = `类${target.classes[0]}`;
    const res = rebuildG11Subtree([...fakeOldTree(), ...foreignTree()], bad);
    expect(res.problems.join(" ")).toContain("贪心取名");
    expect(res.rows).toEqual([]);
  });

  it("旧码→新码对照覆盖全部 L4/L5（审计与回滚依赖它）", () => {
    const old = fakeOldTree().filter((r) => r.level >= 4 && r.groupCode === REHOME_GROUP_CODE);
    expect(out.map.length).toBe(old.length);
    expect(new Set(out.map.map((m) => m.oldCode)).size).toBe(old.length);
    expect(new Set(out.map.map((m) => m.newCode)).size).toBe(old.length);
  });

  it("破坏规格（把一族的类分给两个中类）必须被拒", () => {
    const rows = fakeOldTree();
    // 现树里族 7211 的两个类若被拆到不同抽屉，规格对拍阶段就该红：用一个族缺成员的输入验证
    const broken = rows.filter((r) => r.unspscPrefix !== "721111");
    expect(rebuildG11Subtree(broken).problems.join(" ")).toContain("721111");
    expect(rebuildG11Subtree(broken).rows).toEqual([]);
  });
});

/**
 * 2026-10-12 实测的子类公告量（倒排表行数，temp/probe191.out.txt）。
 * 只用来审计“名字盖不盖得住内容”；数字会漂移，但判据（覆盖度阈值 + 必须标混装）不依赖具体数字。
 */
const NOTICES: ReadonlyMap<string, number> = new Map(Object.entries({
  "721015": 2924, "721021": 290, "721029": 1235, "721031": 126, "721033": 424,
  "721110": 239, "721111": 290,
  "721210": 181, "721211": 598, "721212": 111, "721213": 61, "721214": 746, "721215": 623, "721216": 0,
  "721410": 1268, "721411": 967, "721412": 193, "721414": 71, "721415": 409, "721416": 222, "721417": 124,
  "721510": 226, "721511": 390, "721512": 2431, "721513": 127, "721514": 93, "721515": 494, "721516": 146, "721517": 448,
  "721518": 217, "721519": 263, "721520": 211, "721521": 111, "721522": 66, "721523": 283, "721524": 159, "721525": 235,
  "721526": 336, "721527": 240, "721528": 86, "721529": 382, "721530": 75, "721531": 235, "721532": 1141, "721533": 360,
  "721534": 132, "721535": 153, "721536": 280, "721537": 200, "721539": 226, "721540": 834, "721541": 131, "721542": 93,
  "721543": 242, "721544": 50, "721545": 284, "721546": 2053,
}));

describe("业务层质量审计（A1~A5）", () => {
  it("新规格：无违规，且每个中类都不是单链层", () => {
    const tree = rebuildG11Subtree([...fakeOldTree(), ...foreignTree()]).rows;
    const audit = auditBusinessLayer(tree, NOTICES);
    expect(audit.problems).toEqual([]);
    expect(audit.items.length).toBe(30);
    const l2s = tree.filter((r) => r.level === 2);
    for (const l2 of l2s) expect(audit.items.filter((x) => x.code.startsWith(l2.code)).length).toBeGreaterThanOrEqual(2);
  });

  it("断言有牙：旧树（定长 8 块 + 照抄子类名）必须被同一条审计报出来", () => {
    const old = fakeOldTree();
    const audit = auditBusinessLayer(old, NOTICES);
    expect(audit.problems.join(" ")).toContain("贪心取名");
    expect(audit.problems.join(" ")).toContain("A3");
    expect(audit.items.filter((x) => x.greedy).length).toBeGreaterThan(0);
  });

  it("低覆盖度小类必须写「混装:」否则红", () => {
    const tree = rebuildG11Subtree([...fakeOldTree(), ...foreignTree()]).rows;
    // 把 0305（实测最大子只占 0.28）的混装标记摸掉 ⇒ A4 必须叫
    const bad = tree.map((r) => (r.code === "UGT-B-010305" ? { ...r, note: "无标记" } : r));
    expect(auditBusinessLayer(bad, NOTICES).problems.join(" ")).toContain("混装");
  });
});
