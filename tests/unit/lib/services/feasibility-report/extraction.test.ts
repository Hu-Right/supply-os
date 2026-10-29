import { describe, it, expect, vi } from "vitest";
import {
  buildExtractionUserPrompt,
  extractRequirements,
  parseExtractionResponse,
} from "@/lib/services/feasibility-report/extraction";
import {
  buildExtractionInput,
  capabilityItemFromRow,
  deriveCapabilities,
  normalizeRegistrationStatus,
  requirementItemFromRow,
  splitCertificationTokens,
} from "@/lib/services/feasibility-report/inputs";

describe("feasibility-report 抽取解析（schema 校验）", () => {
  it("合法 JSON → 规范化为 RequirementItem（带 quote 与 evidence 锚点）", () => {
    const raw = JSON.stringify([
      {
        type: "certification",
        importance: "mandatory",
        title: "ISO 14001 认证",
        value: { code: "ISO14001" },
        rawText: "Bidders must hold a valid ISO 14001 certification.",
        source: { kind: "attachment", ref: "doc.pdf", quote: "must hold a valid ISO 14001 certification" },
      },
    ]);
    const { items, issues } = parseExtractionResponse(raw, 123, { now: "2026-10-29T00:00:00.000Z", model: "m1", promptVersion: "v1" });
    expect(issues).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "req-1",
      noticePk: 123,
      type: "certification",
      importance: "mandatory",
      source: { kind: "attachment", ref: "doc.pdf", quote: expect.stringContaining("ISO 14001") },
      extraction: { method: "llm", model: "m1", promptVersion: "v1" },
    });
  });

  it("缺 quote 的条目被丢弃（无证据不结论），并记录 issue", () => {
    const raw = JSON.stringify([
      { type: "certification", importance: "mandatory", title: "无原文证书", value: { code: "X" }, source: {} },
      { type: "experience", importance: "scored", title: "有原文", value: {}, rawText: "近三年两个同类项目" },
    ]);
    const { items, issues } = parseExtractionResponse(raw, 1);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("有原文");
    expect(issues.some((i) => i.includes("缺少原文 quote"))).toBe(true);
  });

  it("非法 type / 空 title 被丢弃，importance 缺省回落 scored，重复项去重", () => {
    const raw = JSON.stringify([
      { type: "unknown_type", title: "bad", rawText: "a" },
      { type: "technical", title: "", rawText: "b" },
      { type: "technical", title: "参数", rawText: "≥500mm", source: { quote: "≥500mm" } },
      { type: "technical", title: "参数", rawText: "≥500mm", source: { quote: "≥500mm" } },
    ]);
    const { items, issues } = parseExtractionResponse(raw, 1);
    expect(items).toHaveLength(1);
    expect(items[0].importance).toBe("scored");
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it("容忍 ```json 代码块与前后说明文字", () => {
    const raw = "以下是结果：\n```json\n[{\"type\":\"delivery\",\"title\":\"交付期\",\"value\":{\"days\":90},\"source\":{\"quote\":\"delivery within 90 days\"}}]\n```\n以上。";
    const { items } = parseExtractionResponse(raw, 1);
    expect(items[0].type).toBe("delivery");
    expect(items[0].value).toEqual({ days: 90 });
  });

  it("非法 JSON 抛 LLM_BAD_JSON；非数组抛 LLM_BAD_SHAPE", () => {
    expect(() => parseExtractionResponse("not json", 1)).toThrow("LLM_BAD_JSON");
    expect(() => parseExtractionResponse('{"a":1}', 1)).toThrow("LLM_BAD_SHAPE");
    expect(() => parseExtractionResponse('[1,2]', 1)).toThrow("LLM_BAD_SHAPE");
  });

  it("extractRequirements 走注入 LLM 并回传 model", async () => {
    const llm = vi.fn().mockResolvedValue(JSON.stringify([
      { type: "registration", title: "UNGM", value: { platform: "UNGM" }, source: { quote: "registered on UNGM" } },
    ]));
    const result = await extractRequirements(
      { noticePk: 7, title: "t", description: "d" },
      { llm, model: "demo-model", promptVersion: "feas-req-v0.1", now: "2026-10-29T00:00:00.000Z" },
    );
    expect(llm).toHaveBeenCalledOnce();
    expect(result.items).toHaveLength(1);
    expect(result.model).toBe("demo-model");
  });

  it("用户 prompt 包含公告关键信息与附件清单", () => {
    const prompt = buildExtractionUserPrompt({
      noticePk: 9,
      title: "Tender",
      description: "desc",
      countryCode: "FR",
      deadlineIso: "2026-12-31T00:00:00.000Z",
      attachments: [{ name: "a.pdf" }],
      opportunity: { eligibility: "ISO 9001", technicalHurdles: null, supplierConditions: null, bidOverview: null },
    });
    expect(prompt).toContain("Tender");
    expect(prompt).toContain("ISO 9001");
    expect(prompt).toContain("a.pdf");
  });
});

describe("feasibility-report 输入装配（DB 行 → 领域对象）", () => {
  it("公告行 → 抽取输入（附件名归一、截止时间换算）", () => {
    const input = buildExtractionInput(
      {
        notice_pk: 1786812089,
        title: "Maintenance",
        description: "desc",
        country_code: "FR",
        deadline_ts: 1790000000,
        attachments: [{ name: "doc.pdf", url: "https://x" }, "raw.txt"],
      },
      { eligibility: "ISO 9001", technical_hurdles: "参数", supplier_conditions: null, bid_overview: "概况" },
    );
    expect(input.noticePk).toBe(1786812089);
    expect(input.countryCode).toBe("FR");
    expect(input.deadlineIso).toContain("T");
    expect(input.attachments).toEqual([{ name: "doc.pdf", url: "https://x" }, { name: "raw.txt" }]);
    expect(input.opportunity).toMatchObject({ eligibility: "ISO 9001", bidOverview: "概况" });
  });

  it("要求项行 → RequirementItem（source/importance 归一）", () => {
    const item = requirementItemFromRow({
      id: 1, notice_pk: 2, version: 1, seq: 3, requirement_type: "certification", importance: "mandatory",
      title: "ISO", value_json: { code: "ISO9001" }, raw_text: "quote",
      source_json: { kind: "attachment", ref: "doc.pdf", quote: "quote" },
      extraction_method: "llm", confidence: "0.9", prompt_version: "v1",
    });
    expect(item.id).toBe("req-3");
    expect(item.value).toEqual({ code: "ISO9001" });
    expect(item.source.kind).toBe("attachment");
    expect(item.extraction?.confidence).toBe(0.9);
  });

  it("企业档案派生能力项：证书 token + UNGM 状态（只做保守推断）", () => {
    expect(splitCertificationTokens("ISO 9001, CE、UL;其他非证书")).toEqual(["ISO 9001", "CE", "UL"]);
    expect(normalizeRegistrationStatus("已注册")).toBe("active");
    expect(normalizeRegistrationStatus("未注册")).toBe("inactive");
    expect(normalizeRegistrationStatus("审核中")).toBeNull();

    const caps = deriveCapabilities({
      enterpriseId: 1001,
      supplier: { id: 1001, company: "A", certification: "ISO 9001, CE" },
      diagnosis: { ungm_status: "已注册", tender_experience: "5 年" },
    });
    const certs = caps.filter((c) => c.type === "certification");
    expect(certs).toHaveLength(2);
    expect(certs[0].evidenceRefs?.[0]).toMatchObject({ kind: "supplier_field", ref: "supplier.certification" });
    // 目录无有效期 → 不编造，置 null（规则会判 unknown）
    expect((certs[0].value as Record<string, unknown>).validUntil).toBeNull();
    expect(caps.find((c) => c.type === "registration")?.value).toMatchObject({ platform: "UNGM", status: "active" });
  });

  it("enterprise_capability_items 行优先覆盖派生能力（同证书 code 去重）", () => {
    const rawRow = {
      id: 9, enterprise_id: 1001, capability_type: "certification", name: "ISO 14001",
      value_json: { kind: "certification", code: "ISO14001", validUntil: "2028-01-01" },
      evidence_refs_json: [{ id: "ev-1", kind: "upload_file", ref: "enterprise_evidence:1", displayName: "ISO14001.pdf" }],
      confirmation_json: { source: "manual", confirmedBy: 42, confirmedAt: "2026-10-20T00:00:00.000Z" },
    } as const;
    const mapped = capabilityItemFromRow(rawRow as never);
    expect(mapped?.id).toBe("cap-row-9");
    const caps = deriveCapabilities({
      enterpriseId: 1001,
      supplier: { id: 1001, certification: "ISO 14001" },
      capabilityRows: [rawRow as never],
    });
    const certs = caps.filter((c) => c.type === "certification");
    // 手工确认行覆盖了同 code 的派生行 → 只剩 1 条
    expect(certs).toHaveLength(1);
    expect(certs[0].id).toBe("cap-row-9");
    expect(certs[0].evidenceRefs?.[0].displayName).toBe("ISO14001.pdf");
  });
});
