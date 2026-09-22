/**
 * 多语言 notice_type 归一化守卫（法语原生值 + 两层口径边界）
 *
 * 背景：平台收录的是 UNGM / IsDB / AfDB / ONEE 等原生法语公告，此前两层归一化只认
 * 英/西/中文词干，"Appel d'Offres International" 整批落 OTHER，类型筛选静默命中不到。
 *
 * 本文件钉住三件事：
 * ① 法语值归到正确桶（含重音/弯引号变体与幂等）；
 * ② 原有英/西/中值行为零变化；
 * ③ **两层一致性的适用边界**：同一原值在 lib（std 码）与 shared（i18n 键）给出同结论；
 *    但「同时含两种类型关键词的复合值」两层规则顺序本就不同（EOI 优先 vs ITB 优先），
 *    属本次改动之前就存在的分叉，此处如实钉住现状并标注，不静默"修正"——
 *    任一侧改序都会重桶化现网存量数据，须单独走口径变更评审。
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

describe("已知分叉（本次改动前即存在，如实钉住，改序须单独评审）", () => {
  it("复合值：lib 把 EOI 放最前，shared 把 ITB 放在 EOI 之前 → 同值不同桶", () => {
    const raw = "Manifestation d'intérêt pour appel d'offres";
    expect(normalizeNoticeType(raw)).toBe("EOI");
    expect(noticeTypeKey(raw)).toBe("procurement_type_itb");
  });

  it("复合值：「投标邀请书(ITB)-框架协议」lib 落 FRAMEWORK、shared 落 ITB", () => {
    const raw = "投标邀请书(ITB)-框架协议";
    expect(normalizeNoticeType(raw)).toBe("FRAMEWORK");
    expect(noticeTypeKey(raw)).toBe("procurement_type_itb");
  });

  it("西/葡语合同分类：lib 有 WORKS/SERVICES 规则，shared 无对应子串规则（返回 null 由调用方原样回退）", () => {
    expect(normalizeNoticeType("Obras de construcción")).toBe("WORKS");
    expect(noticeTypeKey("Obras de construcción")).toBeNull();
    expect(noticeTypeKey("WORKS")).toBe("procurement_type_works");
  });
});
