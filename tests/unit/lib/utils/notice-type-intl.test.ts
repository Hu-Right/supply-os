/**
 * 多语言 notice_type 归一化守卫（法语原生值 + 两层口径边界）
 *
 * 背景：平台收录的是 UNGM / IsDB / AfDB / ONEE 等原生法语公告，此前两层归一化只认
 * 英/西/中文词干，"Appel d'Offres International" 整批落 OTHER，类型筛选静默命中不到。
 *
 * 本文件钉住三件事：
 * ① 法语值归到正确桶（含重音/弯引号变体与幂等）；
 * ② 原有英/西/中值行为零变化；
 * ③ **两层口径已收敛为单一归一器**：shared 的 noticeTypeKey 现直接委托 lib 的
 *    normalizeNoticeType（std 码），二者对任意原值恒同结论——历史上 shared 自带第二套
 *    正则导致的复合值分叉（EOI 优先 vs ITB 优先、SERVICES/SUPPLIES/WORKS 缺子串规则）
 *    已随「一处归一、其余查表」消除，std 码优先级以 lib 为唯一真相。
 */
import { describe, it, expect } from "vitest";

import { normalizeNoticeType, isKnownNoticeType } from "@/lib/utils/notice-type";
import { noticeTypeKey } from "@/shared/utils/notice-type";

describe("normalizeNoticeType · 法语原生值", () => {
  it("Appel d'offres 系归 ITB（含直引号与弯引号变体）", () => {
    expect(normalizeNoticeType("Appel d'Offres International")).toBe("ITB");
    expect(normalizeNoticeType("Avis d'Appel d'Offres National")).toBe("ITB");
    expect(normalizeNoticeType("Appel d’offres restreint")).toBe("ITB");
  });

  it("未收录措辞不假装命中（Appel à la concurrence 仍落 OTHER）", () => {
    expect(normalizeNoticeType("Appel à la concurrence")).toBe("OTHER");
  });

  it("短代码 AO / AOI / AOD / AOM 归 ITB（大小写不敏感）", () => {
    for (const code of ["AO", "AOI", "AOD", "AOM", "aoi"]) {
      expect(normalizeNoticeType(code)).toBe("ITB");
    }
  });

  it("法语询价/建议书/意向/授标/预审各归其桶", () => {
    expect(normalizeNoticeType("Demande de cotation")).toBe("RFQ");
    expect(normalizeNoticeType("Demande de prix")).toBe("RFQ");
    expect(normalizeNoticeType("Demande de propositions")).toBe("RFP");
    expect(normalizeNoticeType("Manifestation d'intérêt")).toBe("EOI");
    expect(normalizeNoticeType("Avis d'attribution du marché")).toBe("AWARD");
    expect(normalizeNoticeType("Préqualification")).toBe("PQ");
  });

  it("归一化幂等，且已识别值必须进入合法类型集合（否则筛选白名单会拒）", () => {
    const samples = [
      "Appel d'Offres International", "AOI", "Demande de cotation", "Demande de propositions",
      "Manifestation d'intérêt", "Avis d'attribution du marché", "Préqualification",
      "Request for Quotation", "International Competitive Bidding", "Invitation to Bid",
    ];
    for (const s of samples) {
      const once = normalizeNoticeType(s);
      expect(normalizeNoticeType(once)).toBe(once);
      expect(isKnownNoticeType(s)).toBe(true);
    }
  });
});

describe("归一化零回归 · 原有英/西/中值", () => {
  it("既有桶位保持不变", () => {
    expect(normalizeNoticeType("Request for Quotation")).toBe("RFQ");
    expect(normalizeNoticeType("Invitation to Bid")).toBe("ITB");
    expect(normalizeNoticeType("Expression of Interest")).toBe("EOI");
    expect(normalizeNoticeType("International Competitive Bidding")).toBe("COMPETITIVE");
    expect(normalizeNoticeType("Pre-Qualification Notice")).toBe("PQ");
    expect(normalizeNoticeType("Obras de construcción")).toBe("WORKS");
    expect(normalizeNoticeType("Servicios de consultoría")).toBe("SERVICES");
    expect(normalizeNoticeType("国际招标公告")).toBe("ITB");
    expect(normalizeNoticeType("采购询价公告")).toBe("RFQ");
    expect(normalizeNoticeType("")).toBe("OTHER");
    expect(normalizeNoticeType(null)).toBe("OTHER");
  });

  it("剥重音/撇号对 CJK 与西里尔原文无副作用（俄语系仍属未覆盖长尾）", () => {
    expect(normalizeNoticeType("采购询价公告")).toBe("RFQ");
    expect(normalizeNoticeType("Тендер")).toBe("OTHER");
    expect(normalizeNoticeType("Аукцион в электронном виде")).toBe("OTHER");
  });
});

describe("两层口径一致性 · 单一类型关键词的常规值", () => {
  // 实际库里存的 notice_type 就是这类短标签，两层必须同结论
  const SAMPLES = [
    "Appel d'Offres International", "Avis d'Appel d'Offres National", "AOI", "AO",
    "Demande de cotation", "Demande de prix", "Demande de propositions",
    "Manifestation d'intérêt", "Avis d'attribution du marché", "Préqualification",
    "Request for Quotation", "Invitation to Bid", "Expression of Interest",
    "International Competitive Bidding", "国际招标公告", "采购询价公告",
  ];

  it("直接判定与「先归一再判定」同结论", () => {
    for (const raw of SAMPLES) {
      const std = normalizeNoticeType(raw);
      expect(noticeTypeKey(std)).toBe(noticeTypeKey(raw));
    }
  });

  it("法语原值在展示层不再落空（前端不再回退生文本）", () => {
    expect(noticeTypeKey("Appel d'Offres International")).toBe("procurement_type_itb");
    expect(noticeTypeKey("Demande de cotation")).toBe("procurement_type_rfq");
    expect(noticeTypeKey("Manifestation d'intérêt")).toBe("procurement_type_eoi");
    expect(noticeTypeKey("Avis d'attribution du marché")).toBe("procurement_type_contract_award");
    expect(noticeTypeKey("Préqualification")).toBe("procurement_type_prequalification");
  });
});

describe("两层口径已收敛 · 复合值现恒同结论（单一归一器，lib 优先级为准）", () => {
  it("复合值：lib 把 EOI 放最前 → shared 亦落 EOI（不再 ITB）", () => {
    const raw = "Manifestation d'intérêt pour appel d'offres";
    expect(normalizeNoticeType(raw)).toBe("EOI");
    expect(noticeTypeKey(raw)).toBe("procurement_type_eoi");
  });

  it("复合值：「投标邀请书(ITB)-框架协议」两层均落 FRAMEWORK（framework 先于 itb）", () => {
    const raw = "投标邀请书(ITB)-框架协议";
    expect(normalizeNoticeType(raw)).toBe("FRAMEWORK");
    expect(noticeTypeKey(raw)).toBe("procurement_type_framework");
  });

  it("西/葡语合同分类：shared 不再依赖自带子串规则，改由 std 码查表命中（不再返回 null）", () => {
    expect(normalizeNoticeType("Obras de construcción")).toBe("WORKS");
    expect(noticeTypeKey("Obras de construcción")).toBe("procurement_type_works");
    expect(noticeTypeKey("WORKS")).toBe("procurement_type_works");
  });
});

describe("OTHER 长尾覆盖 · A 类（分类完备性补齐，探针实测高频值）", () => {
  it("Avis de marché（法语 EU 合同通知）归 CONTRACT_NOTICE", () => {
    expect(normalizeNoticeType("Avis de marché")).toBe("CONTRACT_NOTICE");
    expect(noticeTypeKey("Avis de marché")).toBe("procurement_type_contract_notice");
  });

  it("Obras* 无空格连写归 WORKS（词边界放宽至词首）", () => {
    expect(normalizeNoticeType("ObrasInstalación eléctrica")).toBe("WORKS");
    expect(normalizeNoticeType("ObrasDemolición de inmuebles y movimientos de tierras")).toBe("WORKS");
    expect(normalizeNoticeType("Obras de construcción")).toBe("WORKS"); // 既有不回归
  });

  it("RFT→ITB、ITQ→RFQ（招标/报价缩写码）", () => {
    expect(normalizeNoticeType("RFT")).toBe("ITB");
    expect(normalizeNoticeType("ITQ")).toBe("RFQ");
  });

  it("Open procedure / Two-stage Tendering → ITB", () => {
    expect(normalizeNoticeType("Open procedure")).toBe("ITB");
    expect(normalizeNoticeType("Two-stage Tendering")).toBe("ITB");
  });

  it("Invitation to Qualify → PQ", () => {
    expect(normalizeNoticeType("Invitation to Qualify")).toBe("PQ");
  });

  it("Sole/Single source / Directed Contract → DIRECT_CONTRACTING", () => {
    expect(normalizeNoticeType("Sole source bidding")).toBe("DIRECT_CONTRACTING");
    expect(normalizeNoticeType("Single source bidding")).toBe("DIRECT_CONTRACTING");
    expect(normalizeNoticeType("Directed Contract")).toBe("DIRECT_CONTRACTING");
  });

  it("Procurement notice (goods) → SUPPLIES", () => {
    expect(normalizeNoticeType("Procurement notice (goods)")).toBe("SUPPLIES");
  });
});

describe("OTHER 长尾覆盖 · B 类（新增采购/通知形态 + 高频歧义并入）", () => {
  it("世行顾问选择类：Individual / Firm / merit competition → IC", () => {
    expect(normalizeNoticeType("Individual")).toBe("IC");
    expect(normalizeNoticeType("Firm")).toBe("IC");
    expect(normalizeNoticeType("Open merit competition (consultancy)")).toBe("IC");
  });

  it("事前/意向通知族 → PIN（不与已有 AWARD 争抢）", () => {
    expect(normalizeNoticeType("Notice of Intent (BPS)")).toBe("PIN");
    expect(normalizeNoticeType("NOI")).toBe("PIN");
    expect(normalizeNoticeType("Advance Notice")).toBe("PIN");
    expect(normalizeNoticeType("Voluntary Ex-Ante Transparency (EU)")).toBe("PIN");
    // 回归：含 award 的预告仍走 AWARD（PIN 的 advance notice 不截胡）
    expect(normalizeNoticeType("Advance Contract Award Notice")).toBe("AWARD");
  });

  it("竞价/拍卖 → 新桶 AUCTION", () => {
    expect(normalizeNoticeType("Reverse auction (electronic)")).toBe("AUCTION");
    expect(normalizeNoticeType("Timber Auction")).toBe("AUCTION");
    expect(normalizeNoticeType("Abbreviated selection (reverse auction)")).toBe("AUCTION");
    expect(noticeTypeKey("Reverse auction")).toBe("procurement_type_auction");
  });

  it("小额/最低价采购 → 新桶 LOW_VALUE", () => {
    expect(normalizeNoticeType("Minimum value purchase")).toBe("LOW_VALUE");
    expect(normalizeNoticeType("Abbreviated selection (lowest value)")).toBe("LOW_VALUE");
  });

  it("西语资产类合同 → 新桶 PATRIMONIAL", () => {
    expect(normalizeNoticeType("PatrimonialConcesión demanial")).toBe("PATRIMONIAL");
    expect(normalizeNoticeType("PatrimonialArrendamiento de inmuebles")).toBe("PATRIMONIAL");
  });

  it("更正/变更通知 → 新桶 AMENDMENT", () => {
    expect(normalizeNoticeType("Announcement amendment")).toBe("AMENDMENT");
    expect(normalizeNoticeType("Modification Notice (EU)")).toBe("AMENDMENT");
    expect(normalizeNoticeType("Corrigendum (EU)")).toBe("AMENDMENT");
    expect(normalizeNoticeType("Agreement Update Notice")).toBe("AMENDMENT");
  });

  it("比价/报价 → RFQ", () => {
    expect(normalizeNoticeType("Price comparison")).toBe("RFQ");
    expect(normalizeNoticeType("Request for Quote")).toBe("RFQ");
  });

  it("REQUEST 错桶修正：Request for Bid/Tender 应归 ITB（不再误落 REQUEST）", () => {
    expect(normalizeNoticeType("Request for Bid(Open-Tender)")).toBe("ITB");
    expect(normalizeNoticeType("Request for Tender")).toBe("ITB");
    // 真·通用请求仍留 REQUEST
    expect(normalizeNoticeType("Request for Submissions")).toBe("REQUEST");
  });

  it("新桶幂等且进入合法集（否则筛选白名单会拒）", () => {
    for (const s of ["AUCTION", "LOW_VALUE", "PATRIMONIAL", "AMENDMENT"]) {
      expect(normalizeNoticeType(s)).toBe(s);
    }
    expect(normalizeNoticeType("Timber Auction")).toBe("AUCTION");
  });

  it("C 轮：Special Notice（美国 SAM 预招标/意向伞类）→ PIN", () => {
    expect(normalizeNoticeType("Special Notice")).toBe("PIN");
    expect(noticeTypeKey("Special Notice")).toBe("procurement_type_pin");
    // Special regime 另入 SPECIAL_REGIME（A 轮提质：不再误留 OTHER）
    expect(normalizeNoticeType("Special regime contracting")).toBe("SPECIAL_REGIME");
  });
});

describe("特别/例外程序 → SPECIAL_REGIME（A 轮提质：把 OTHER 里的真类型提出来）", () => {
  it("Special regime / Exceptional procedure / 西语特别体制 → SPECIAL_REGIME", () => {
    expect(normalizeNoticeType("Special regime contracting")).toBe("SPECIAL_REGIME");
    expect(normalizeNoticeType("Exceptional procedure")).toBe("SPECIAL_REGIME");
    expect(normalizeNoticeType("Administrativo especial")).toBe("SPECIAL_REGIME");
    expect(normalizeNoticeType("Contratación especial")).toBe("SPECIAL_REGIME");
    expect(noticeTypeKey("Special regime contracting")).toBe("procurement_type_special_regime");
  });
  it("幂等：SPECIAL_REGIME 再归一不漂移、且属合法类型", () => {
    expect(normalizeNoticeType("SPECIAL_REGIME")).toBe("SPECIAL_REGIME");
    expect(isKnownNoticeType("Exceptional procedure")).toBe(true);
  });
  it("不误伤同含 procedure 的既有桶（回归）", () => {
    expect(normalizeNoticeType("Open procedure")).toBe("ITB");
    expect(normalizeNoticeType("Negotiated procedure")).toBe("NEGOTIATED");
    expect(normalizeNoticeType("Restricted procedure")).toBe("RESTRICTED");
  });
});
