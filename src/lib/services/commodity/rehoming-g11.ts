/**
 * 品目树 01「建筑施工与运维服务」（UGT-G-11 / UNSPSC 72 段）归位规格与纯重排函数
 *
 * 定位：本模块是**数据层设计单一事实源**，不连库、不读写文件（与 groups.ts 同一纪律），
 *      因此阶段一影子表脚本、门禁、单测都能直接 import 同一份规格，不会出现两套归位口径。
 *
 * 为什么中类只能按「族」切（BB3 硬约束，不是偷懒）：
 *   门禁 BB3 要求「同一个 UNSPSC 族的所有类行必须落在同一个中类下」，因为族级粗码（如 72150000）
 *   的落点必须唯一可证。实测 72 段里族级粗码挂了 13,601 条公告，所以这条不能松。
 *   ⇒ 中类层只能做「族打包」决策；真正的语义归类全部下沉到小类（L3）层，那里成员是 6 位类，可自由分组。
 *
 * 为什么旧结构必须推翻（实测依据见 runtime/commodity-g11-chunk-rule.txt、runtime/commodity-g11-audit-edges.txt，
 *   由 scripts/tools/probe195-chunk-rule.ts 与 probe192-g11-audit-edges.ts 只读产出）：
 *   1. 旧小类是「每 8 个类切一刀」的定长分块：全树 42.6% 的小类恰好含 8 个子类，
 *      7215 族 36 个类被切成 721510-17 / 18-25 / 26-33 / 34-42 / 43-46；
 *   2. 旧小类名取自块内公告量最大的那个子类（全树 89.7% 的小类与某子类同名），
 *      于是「动物栖息地笼舍」装着发电设备维保，「暖通空调」装着电气/通信/安防；
 *   3. 旧中类只有 3 个，其中 1 个把族 7210（维护修理）与 7215（专业分包）并成 17,948 公告的混装桶。
 *
 * 名制纪律（写死了，改规格前先过这些判据）：
 *   - 中类/小类名不得含「等」（门禁 BB5 直接红），不得用「最大子」的名字当父名；
 *   - note 以「混装:」开头 = 该桶承认语义不齐；「跨类待议:」= 语义上更像别的抽屉，但受 BB3/BB4 锁段改不动；
 *   - 公告量为 2026-10-12 倒排表实测（runtime/commodity-g11-audit-tree.txt，由 scripts/tools/probe191-g11-audit-tree.ts 产出），仅用于人工审读，不参与判定。
 *
 * 归位映射的产物：L4/L5 的码一定会变（码长即层级、父码=自身去末两级 ⇒ 路径变了码就变了），
 *   所以派生层（落点表 / 倒排表 / 宽表 backbone_path / 商机 precise）必须整批重算，
 *   旧码→新码的完整对照由阶段一脚本导出 tsv 存档，note 里不塞。
 */
// 码长里的前缀长度只从 backbone-path 取一份：2026-10-13 改码 UGT-B-… → UGT-… 时，
// 本文件两处写死旧长度的判据全体误报（RH-7 每行都红）与静默失效（RH-11 核到了小类）。
import { BACKBONE_NODE_PREFIX } from "./backbone-path";

/** 本次归位只动这一个抽屉 */
export const REHOME_GROUP_CODE = "UGT-G-11";
/** 该抽屉的骨架 L1 码（大类行本身不动，只动它的子树） */
export const REHOME_L1_CODE = "UGT-01";

/** 一个小类（L3）：名字 + 成员 UNSPSC 6 位类前缀（顺序即界面 sort，按公告量降序） */
export interface L3Spec {
  /** 同父内序号（1 起，落进码里） */
  seq: number;
  nameZh: string;
  /** 成员 UNSPSC 类前缀；一个前缀在整棵规格里必须且只能出现一次 */
  classes: string[];
  /** 依据与待审点（进 note，含「混装:」「跨类待议:」标记） */
  basis: string;
}

/** 一个中类（L2）：名字 + 认领的 UNSPSC 族 + 所辖小类 */
export interface L2Spec {
  seq: number;
  nameZh: string;
  /** 认领族前缀（4 位）：BB3 要求族内所有类都在本中类下，脚本会逐族校验 */
  families: string[];
  basis: string;
  l3: L3Spec[];
}

/**
 * 新结构：4 中类 / 30 小类 / 57 子类（旧：3 中类 / 9 小类 / 57 子类）。
 * 中类 = 族粒度；小类 = 语义粒度（7215 族 36 个类切 14 组）。
 */
export const G11_REHOMING: readonly L2Spec[] = [
  {
    seq: 1,
    nameZh: "房屋建筑施工",
    families: ["7211", "7212"],
    basis: "族 7211 住宅 + 7212 非住宅：同一采购主体（盖房子），合并成一个中类，住宅/公共/工业/商业在小类层分线",
    l3: [
      { seq: 1, nameZh: "住宅建筑施工", classes: ["721110", "721111"], basis: "旧挂在「工业厂房施工服务」下（错挂纠正）；单户 239 + 多单元 290" },
      { seq: 2, nameZh: "公共与民生建筑施工", classes: ["721214"], basis: "学校 386 / 医院 214 / 图书馆 / 消防站 / 机场航站楼 / 会展 等 12 叶，共 746" },
      { seq: 3, nameZh: "工业厂房与仓储建筑施工", classes: ["721215", "721210"], basis: "混装:721215 叶含污水处理厂 281、发电厂、炼油与 LNG、海上油气平台，名义是「厂房」实为工业与市政厂站，待叶级拆分" },
      { seq: 4, nameZh: "商业与办公房屋施工", classes: ["721211"], basis: "598，其中改造和维修 322 占多数（新建仅 176），与 04 维护修理事务有交叉" },
      { seq: 5, nameZh: "农业与养殖房屋施工", classes: ["721212"], basis: "111；与大类 G-01 农林牧渔边界待议（标的若是畜舍属建筑）" },
      { seq: 6, nameZh: "车库与能源配套建筑施工", classes: ["721213", "721216"], basis: "混装:汽车车库与加油站施工 61 + 海上风电场服务 0（该子类及其 6 叶全库零公告，建议保留归属、观察后停用）" },
    ],
  },
  {
    seq: 2,
    nameZh: "市政与重型工程施工",
    families: ["7214"],
    basis: "族 7214 重型建筑：旧中类名沿用了最大族名、旧小类名又沿用最大类名「高速公路」，把海上施工/轨道/整地/设备租赁全塞进公路名下",
    l3: [
      { seq: 1, nameZh: "公路与城市道路施工", classes: ["721410"], basis: "1,268；叶含路标和护栏建造维修 235（交通安全设施，与 G-09 交叉）" },
      { seq: 2, nameZh: "市政管线与构筑物铺设", classes: ["721411"], basis: "混装:967 / 31 叶横跨桥梁、隧道、油气与给排水管网、输电与通信线路、泵站、蓄水池，还含公园广场与装饰喷泉施工 400+ 及「公路用涂料」（货物，属 G-05）" },
      { seq: 3, nameZh: "水利港口与海洋施工", classes: ["721412"], basis: "193；水坝/运河/港口/码头/疏浚/板桩/水下施工" },
      { seq: 4, nameZh: "场地平整与土方工程", classes: ["721415"], basis: "409；与 0310 场地准备（721539）语义相邻，分属两族不能并桶" },
      { seq: 5, nameZh: "轨道交通与公交设施施工", classes: ["721416"], basis: "222；含铁轨维修 2" },
      { seq: 6, nameZh: "特种监管设施与施工设备租赁", classes: ["721414", "721417"], basis: "混装:拘留设施施工 71 + 工程机械和设备租赁 124；后者与 721015 下便携式发电机租赁、72154064 便携照明租赁同语义，跨族改不动" },
    ],
  },
  {
    seq: 3,
    nameZh: "建筑专业分包与安装维保",
    families: ["7215"],
    basis: "族 7215 专业商贸承包 36 个类：旧树按每 8 个一类切成 5 个小类，是错挂最密集处；本次按工种语义重切 14 组",
    l3: [
      { seq: 1, nameZh: "暖通空调与供热锅炉安装维保", classes: ["721512", "721510", "721541"], basis: "2,788（HVAC 2,431 + 锅炉熔炉 226 + 配电空调设备维保 131）；721541 旧挂 0314 杂项，属机电" },
      { seq: 2, nameZh: "给排水水暖与管件施工", classes: ["721511", "721544"], basis: "440；水暖 390 + 管件装配修理 50" },
      { seq: 3, nameZh: "建筑电气与发电设备服务", classes: ["721515", "721543"], basis: "混装:电气系统服务 494（22 叶含热电厂施工、变压器与发电机维护、电力供应）+ 发电设备维保 242；旧把 721543 挂在动物笼舍小类下" },
      { seq: 4, nameZh: "通信安防与自动化控制系统", classes: ["721517", "721516", "721542"], basis: "687（安防系统安装 448 + 专业通信 146 + 仪表安装维保 93）；旧三者分别在「暖通空调」与「杂项」下" },
      { seq: 5, nameZh: "装饰装修与墙面地面工程", classes: ["721536", "721520", "721525", "721513", "721514", "721522"], basis: "混装:1,012（室内装修改建 280 含办公家具安装 101/租赁 75，与 G-10 交叉 + 抹灰 211 + 地板 235 + 粉刷 127 + 墙面 93 + 瓷砖 66）；旧被 8 切块劈成三个小类" },
      { seq: 6, nameZh: "木作门窗与玻璃幕墙安装", classes: ["721523", "721524", "721530"], basis: "517；木工 283（叶含橱柜打造 173）+ 门窗 159 + 玻璃 75" },
      { seq: 7, nameZh: "砌筑与石作工程", classes: ["721519"], basis: "263；旧小类名直接叫「石砌和石雕服务」并顺带吞下 721518 机器安装（已纠正到 0311）" },
      { seq: 8, nameZh: "保温隔热与防水防腐防火", classes: ["721532", "721521"], basis: "1,252；721532 里管道和锅炉隔热服务单叶 1,010，与 0301 的 721510 锅炉跨小类相邻——受 6 位码锁爹限制，只能靠 note 交叉提示" },
      { seq: 9, nameZh: "结构钢混凝土与屋面围护", classes: ["721529", "721526", "721527"], basis: "958（结构钢架设 382 + 屋顶壁板钣金 336 + 混凝土 240，叶含挡土墙 84、地基 71、路缘、车道）；旧全在「涂层填缝防雨防火」下" },
      { seq: 10, nameZh: "场地准备与脚手架临时工程", classes: ["721539", "721534", "721528"], basis: "444；建筑场地准备 226 + 索具脚手架 132 + 水井钻探 86；旧三者散在「杂项」「涂层」两处" },
      { seq: 11, nameZh: "专业设备安装与维保", classes: ["721533", "721545", "721518", "721537"], basis: "混装:1,061（服务站设备 360 + 重型设备 284 + 机器安装维保 217 + 停车场设备 200）；本组是「设备」而非「建筑」，与 G-21/G-28 边界待议" },
      { seq: 12, nameZh: "体育休闲与动物笼舍专项施工", classes: ["721546", "721531"], basis: "混装:2,288；⚠ 721546 五个动物园笼舍叶合计 6,058 标签行（1,985 为最高），抽样标题是水塔施工/健康中心翻新/玻璃窗工程，判定为上游标签错配高发簇，必须先治打标再谈细化" },
      { seq: 13, nameZh: "构筑物外部清洁", classes: ["721535"], basis: "跨类待议:153，语义属大类 G-12 清洁环境与设施维护（其抽屉已有「一般建筑物、办公室清洁和维护服务」），受 BB3/BB4 锁段改不动" },
      { seq: 14, nameZh: "其他专业与行业服务", classes: ["721540"], basis: "混装:834 / 71 叶，全组最大杂项桶——电梯扶梯 219、围栏栏杆 154、标志牌 69、剧场道具 62、办公设备维护 103、坟墓搬迁 38、游行花车 36、核电与氢能加注 72、储罐与泄漏检测系列 160；叶级归属才是精度所在，建议下一步给高频叶做单独筛选口径" },
    ],
  },
  {
    seq: 4,
    nameZh: "建筑与设施维护修理",
    families: ["7210"],
    basis: "族 7210 维护修理：旧与 7215 并成一个中类（混装桶 17,948），且小类名叫「修理服务」；本次独立成中类并按对象分层",
    l3: [
      { seq: 1, nameZh: "建筑物维护与修理", classes: ["721015"], basis: "混装:2,924 / 23 叶，含地板清洁 447（跨类待议 G-12）、垃圾区施工 262（G-12）、消防系统与灭火器 317（G-09）、电梯维护 153、临时工 61（非工程）、便携式发电机维保与租赁 184、制氢与陆上电力设施维护（零公告待审）" },
      { seq: 2, nameZh: "设施与室外景观养护", classes: ["721029"], basis: "跨类待议:1,235，7 叶里景观美化 638、除雪 203、室外地面养护 110、景观建筑 78 实为园林绿化，与 0202 的公园广场施工同语义；旧名「设施维护和修理服务」名不副实" },
      { seq: 3, nameZh: "市政与输水设施维护修理", classes: ["721033", "721031"], basis: "550；基础设施维保 424（叶含停车场道路养护 315）+ 输水系统安装修理 126" },
      { seq: 4, nameZh: "有害生物防治服务", classes: ["721021"], basis: "跨类待议:289，语义属 G-12 或 G-25 卫生服务，受 BB4 锁段改不动" },
    ],
  },
];

/** 规格自检（纯函数，返回违规清单，空即通过）：成员全覆盖、无重复、族不跨中类、序号连续、名制合规。
 *  spec 可注入破坏样本（与 validateCommodityGroups 同一做法），默认校本模块规格 ⇒ 断言有牙。 */
export function validateRehomeSpec(
  rows: readonly { level: number; groupCode: string; unspscPrefix: string | null }[],
  spec: readonly L2Spec[] = G11_REHOMING,
): string[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  const famOf = (p: string) => p.slice(0, 4);
  const l2Seqs: number[] = [];
  for (const l2 of spec) {
    l2Seqs.push(l2.seq);
    if (!l2.nameZh.trim()) problems.push(`CG-a 中类 ${l2.seq} 名为空`);
    if (l2.nameZh.includes("等")) problems.push(`CG-b 中类 ${l2.seq}「${l2.nameZh}」含含糊名「等」（门禁 BB5 会红）`);
    const l3Seqs: number[] = [];
    for (const l3 of l2.l3) {
      l3Seqs.push(l3.seq);
      if (!l3.nameZh.trim()) problems.push(`CG-a 小类 ${l2.seq}-${l3.seq} 名为空`);
      if (l3.nameZh.includes("等")) problems.push(`CG-b 小类「${l3.nameZh}」含含糊名「等」`);
      if (!l3.classes.length) problems.push(`CG-c 小类 ${l2.seq}-${l3.seq}「${l3.nameZh}」没有成员`);
      for (const p of l3.classes) {
        if (!/^[0-9]{6}$/.test(p)) { problems.push(`CG-d 成员码形制非法：${p}`); continue; }
        const prev = seen.get(p);
        if (prev) problems.push(`CG-e 类 ${p} 重复归属：${prev} 与 中类${l2.seq}/小类${l3.seq}`);
        else seen.set(p, `中类${l2.seq}/小类${l3.seq}`);
        const fam = famOf(p);
        if (!l2.families.includes(fam)) problems.push(`CG-f 类 ${p} 属族 ${fam}，但中类 ${l2.seq}「${l2.nameZh}」只认领族 ${l2.families.join(",")}`);
      }
    }
    for (let i = 1; i <= l3Seqs.length; i++) if (!l3Seqs.includes(i)) problems.push(`CG-g 中类 ${l2.seq} 的小类序号不连续（缺 ${i}）`);
  }
  for (let i = 1; i <= l2Seqs.length; i++) if (!l2Seqs.includes(i)) problems.push(`CG-h 大类下中类序号不连续（缺 ${i}）`);

  // 与现状树对拍：一个不多一个不少（缺成员 = 归位后公告无处安放；多成员 = 造了不存在的码）
  const have = rows.filter((r) => r.level === 4 && r.groupCode === REHOME_GROUP_CODE && r.unspscPrefix).map((r) => r.unspscPrefix as string);
  for (const p of have) if (!seen.has(p)) problems.push(`CG-i 现树子类 ${p} 未被规格认领 ⇒ 归位后会丢失该节点`);
  for (const p of seen.keys()) if (!have.includes(p)) problems.push(`CG-j 规格认领了现树不存在的子类 ${p}`);
  return problems;
}

/** 骨架行（与表列一一对应的最小集；阶段一脚本负责列名映射） */
export interface BackboneRow {
  code: string;
  parentCode: string;
  level: number;
  groupCode: string;
  unspscPrefix: string | null;
  nameZh: string;
  nameEn: string;
  sort: number;
  status: number;
  note: string;
}

/** 归位产物：新行 + 旧码→新码对照（审计与回滚用） */
export interface RehomeResult {
  rows: BackboneRow[];
  map: Array<{ oldCode: string; newCode: string; level: number; prefix: string | null }>;
  problems: string[];
}

const two = (n: number) => String(n).padStart(2, "0");

/**
 * 用规格重排整棵 01 子树。输入是**全表**行（函数自己挑出 G-11），返回整棵新 01 子树
 * （含原样透传的大类 L1 行）；调用方负责把它与其余 31 棵子树拼接后写影子表。
 * 结构判据不满足时 problems 非空且**不返回 rows**（调用方必须拒绝写入）。
 */
export function rebuildG11Subtree(allRows: readonly BackboneRow[], spec: readonly L2Spec[] = G11_REHOMING): RehomeResult {
  const problems = [...validateRehomeSpec(allRows, spec)];
  const l1 = allRows.find((r) => r.level === 1 && r.groupCode === REHOME_GROUP_CODE);
  if (!l1 || l1.code !== REHOME_L1_CODE) {
    return { rows: [], map: [], problems: [`RH-0 找不到大类行或码不符：期望 ${REHOME_L1_CODE}，实际 ${l1?.code ?? "无"}`] };
  }

  // 现状索引：6 位类 → 其 L4 行 + 其全部 L5 行（按码排序，保证重排后叶子顺序确定）
  const l4ByPrefix = new Map<string, BackboneRow>();
  for (const r of allRows) {
    if (r.level === 4 && r.groupCode === REHOME_GROUP_CODE && r.unspscPrefix) l4ByPrefix.set(r.unspscPrefix, r);
  }
  const l5ByParent = new Map<string, BackboneRow[]>();
  for (const r of allRows) {
    if (r.level !== 5 || r.groupCode !== REHOME_GROUP_CODE) continue;
    if (!l5ByParent.has(r.parentCode)) l5ByParent.set(r.parentCode, []);
    l5ByParent.get(r.parentCode)!.push(r);
  }
  for (const list of l5ByParent.values()) list.sort((a, b) => String(a.unspscPrefix).localeCompare(String(b.unspscPrefix)));

  const rows: BackboneRow[] = [];
  const map: RehomeResult["map"] = [];
  const newCodes = new Set<string>();
  const pushRow = (r: BackboneRow) => {
    if (newCodes.has(r.code)) problems.push(`RH-1 新码重复：${r.code}`);
    newCodes.add(r.code);
    rows.push(r);
  };
  // 大类行原样透传：段→大类由 BB4/常量锁死，本次不动它，权益墙与快筛 chip 才不受影响
  pushRow({ ...l1 });
  const l2CountByFam = new Map<string, string[]>();

  for (const l2 of spec) {
    const l2Code = `${l1.code}${two(l2.seq)}`;
    pushRow({
      code: l2Code, parentCode: l1.code, level: 2, groupCode: l1.groupCode,
      unspscPrefix: null, nameZh: l2.nameZh, nameEn: "", sort: l2.seq, status: 1,
      note: `人工归位 ${l2.families.map((f) => `族${f}`).join(",")}｜${l2.basis}`,
    });
    for (const f of l2.families) {
      const prev = l2CountByFam.get(f);
      if (prev) problems.push(`RH-2 族 ${f} 被两个中类认领：${prev.join(",")} 与 ${l2.seq}`);
      l2CountByFam.set(f, [String(l2.seq)]);
    }

    for (const l3 of l2.l3) {
      const l3Code = `${l2Code}${two(l3.seq)}`;
      pushRow({
        code: l3Code, parentCode: l2Code, level: 3, groupCode: l1.groupCode,
        unspscPrefix: null, nameZh: l3.nameZh, nameEn: "", sort: l3.seq, status: 1,
        note: `人工归位｜成员 ${l3.classes.join(",")}｜${l3.basis}`,
      });
      // 旧小类名不得被原样继承（这正是旧树 89.7% 错挂的来源）
      if (l3.classes.length > 1) {
        for (const p of l3.classes) {
          const old = l4ByPrefix.get(p);
          if (old && old.nameZh.trim() === l3.nameZh.trim()) problems.push(`RH-3 多成员小类「${l3.nameZh}」与子类 ${p} 同名（贪心取名回潮）`);
        }
      }

      l3.classes.forEach((p, idx) => {
        const old = l4ByPrefix.get(p);
        if (!old) { problems.push(`RH-4 现树缺子类 ${p}（规格与库不一致）`); return; }
        const l4Code = `${l3Code}${two(idx + 1)}`;
        pushRow({ ...old, code: l4Code, parentCode: l3Code, sort: idx + 1, groupCode: l1.groupCode });
        map.push({ oldCode: old.code, newCode: l4Code, level: 4, prefix: p });
        const kids = l5ByParent.get(old.code) ?? [];
        kids.forEach((k, ki) => {
          const l5Code = `${l4Code}${two(ki + 1)}`;
          pushRow({ ...k, code: l5Code, parentCode: l4Code, sort: ki + 1, groupCode: l1.groupCode });
          map.push({ oldCode: k.code, newCode: l5Code, level: 5, prefix: k.unspscPrefix });
        });
      });
    }
  }

  // 数量守恒：L4/L5 一行都不能少或多（丢失 = 该节点公告永远筛不到；多 = 造码）
  const oldL4 = [...l4ByPrefix.values()];
  const oldL5 = allRows.filter((r) => r.level === 5 && r.groupCode === REHOME_GROUP_CODE);
  const newL4 = rows.filter((r) => r.level === 4);
  const newL5 = rows.filter((r) => r.level === 5);
  if (newL4.length !== oldL4.length) problems.push(`RH-5 子类数不等：旧 ${oldL4.length} 新 ${newL4.length}`);
  if (newL5.length !== oldL5.length) problems.push(`RH-6 品目数不等：旧 ${oldL5.length} 新 ${newL5.length}`);
  const newL2 = rows.filter((r) => r.level === 2).length;
  const newL3 = rows.filter((r) => r.level === 3).length;
  if (newL2 !== spec.length) problems.push(`RH-13 中类行数=${newL2}，规格声明 ${spec.length}`);
  if (newL3 !== spec.reduce((t, l) => t + l.l3.length, 0)) problems.push(`RH-14 小类行数=${newL3}，与规格不符`);

  // 结构自检：码长即层级、父码=自身去末两级、父存在、码唯一
  const codeSet = new Set(rows.map((r) => r.code));
  for (const r of rows) {
    if (r.code.length !== BACKBONE_NODE_PREFIX.length + r.level * 2) {
      problems.push(`RH-7 码长与层级不符：${r.code}（L${r.level}）`);
    }
    if (r.level > 2 && !codeSet.has(r.code.slice(0, -2))) problems.push(`RH-8 父码≠自身去末两级（父不存在）：${r.code}`);
    if (r.level > 1 && r.parentCode !== r.code.slice(0, -2)) problems.push(`RH-9 parent_code 与码路径不一致：${r.code}→${r.parentCode}`);
    if (r.level >= 4 && r.parentCode === l1.code) problems.push(`RH-10 子类直挂大类：${r.code}`);
  }
  // 族→中类唯一（BB3 的镜像，逐族核到新码）
  const famToL2 = new Map<string, string>();
  for (const r of rows.filter((x) => x.level === 4)) {
    const fam = String(r.unspscPrefix).slice(0, 4);
    // 中类码 = 前缀 + 4 位数字；写死长度会在改码后取到小类码，RH-11 就悄悄核错了层
    const l2 = r.code.slice(0, BACKBONE_NODE_PREFIX.length + 4);
    const prev = famToL2.get(fam);
    if (prev && prev !== l2) problems.push(`RH-11 族 ${fam} 的类行跨了两个中类：${prev} 与 ${l2}`);
    famToL2.set(fam, l2);
  }
  // 同父内不得重名（BB5 同名兄弟硬项）
  const sibSeen = new Map<string, Set<string>>();
  for (const r of rows.filter((x) => x.level === 2 || x.level === 3)) {
    if (!sibSeen.has(r.parentCode)) sibSeen.set(r.parentCode, new Set());
    const set = sibSeen.get(r.parentCode)!;
    if (set.has(r.nameZh)) problems.push(`RH-12 同父重名：${r.parentCode} 下「${r.nameZh}」`);
    set.add(r.nameZh);
  }

  return problems.length ? { rows: [], map, problems } : { rows, map, problems };
}

/** 单个小类的审计结果（验收器直接打印同一结构，保证两边口径一致） */
export interface AuditItem {
  code: string;
  name: string;
  kids: number;
  cover: number;
  greedy: boolean;
  crossFamily: number;
  mixed: boolean;
}

/**
 * 业务层质量审计（纯函数）：把「名字盖不盖得住内容」变成可断言的数字。
 *
 * 为什么需要它：结构门禁（码长、父码、族唯一）全绿的树照样可以名实不符 —— 旧 01 抽屉
 * 9 个小类里 7 个照抄子类名、5 个是定长 8 块。这些只能靠「最大子公告占比 + 命名不重」量化。
 *
 * 判据：
 *   A1 贪心取名：多成员小类名 == 某子类名 ⇒ 违规（无例外）；
 *   A2 单链层：中类只有 1 个小类 ⇒ 中间层没有信息量（本次 4 个中类各 4~14 个小类）；
 *   A3 跨族：同一小类内出现多个 UNSPSC 族 ⇒ 违背「族是标准里的自然归类单位」；
 *   A4 覆盖度：小类内公告量最大子类的占比 < 阈值时，note 必须写「混装:」承认，否则违规；
 *   A5 扇出上限：单父孩子数 > 99 会破两位编码（门禁 BB1）。
 * countsByPrefix 是外部注入的公告量（按 6 位类前缀），函数本身不碰库；
 * 验收器（scripts/tools/commodity-g11-rehome-verify.ts）复用本函数，判据只实现一份。
 */
export function auditBusinessLayer(
  rows: readonly BackboneRow[],
  countsByPrefix: ReadonlyMap<string, number> = new Map(),
  minCover = 0.35,
): { items: AuditItem[]; problems: string[] } {
  const problems: string[] = [];
  const items: AuditItem[] = [];
  const child = (code: string, lv: number) => rows.filter((r) => r.parentCode === code && r.level === lv);
  for (const l2 of rows.filter((r) => r.level === 2)) {
    const l3s = child(l2.code, 3);
    if (l3s.length < 2) problems.push(`A2 中类「${l2.nameZh}」只有 ${l3s.length} 个小类，中间层没有信息量`);
    for (const l3 of l3s) {
      const l4s = child(l3.code, 4);
      if (l4s.length > 99) problems.push(`A5 「${l3.nameZh}」子节点 ${l4s.length} 个，超两位编码上限`);
      const greedy = l4s.length > 1 && l4s.some((k) => k.nameZh.trim() === l3.nameZh.trim());
      const fams = new Set(l4s.map((k) => String(k.unspscPrefix ?? "").slice(0, 4)).filter(Boolean));
      const mixed = l3.note.includes("混装:"); // 归位后的 note 前缀是「人工归位｜成员…」，混装标记在后段 ⇒ 用包含判定
      const total = l4s.reduce((t, k) => t + (countsByPrefix.get(String(k.unspscPrefix)) ?? 0), 0);
      const top = Math.max(0, ...l4s.map((k) => countsByPrefix.get(String(k.unspscPrefix)) ?? 0));
      const cover = total > 0 ? top / total : 1;
      if (greedy) problems.push(`A1 小类「${l3.nameZh}」与它的某个子类同名（贪心取名）`);
      if (fams.size > 1) problems.push(`A3 小类「${l3.nameZh}」跨了 ${fams.size} 个族：${[...fams].join(",")}`);
      if (cover < minCover && !mixed) problems.push(`A4 小类「${l3.nameZh}」覆盖度 ${cover.toFixed(2)} 且未标「混装:」`);
      items.push({ code: l3.code, name: l3.nameZh, kids: l4s.length, cover: Number(cover.toFixed(2)), greedy, crossFamily: fams.size, mixed });
    }
  }
  return { items, problems };
}
