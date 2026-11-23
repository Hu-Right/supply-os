/**
 * 诊断仓储 V3 写入契约测试
 *
 * @module tests/unit/lib/repos/supplier-diagnosis-v3-write
 * @description 迁移 069 把表换成了 V3（加 target_markets / qual_*），这里用假 pool 钉住写入口径：
 *              - `bid_willingness` **不得**出现在 INSERT/UPDATE 里（它已下线，新行吃表 DEFAULT('是')，
 *                老行的历史值也不能被一次提交覆盖）；
 *              - `target_markets` / `qual_grade` / `qual_breakdown` / `schema_version` 必须写；
 *              - 占位符个数与参数个数一致（少一个 ? 或错一个顺序，在真库上是 500，在单测里就该先炸）。
 */
import { describe, it, expect } from "vitest";
import { DIAGNOSIS_SCHEMA_VERSION, SupplierDiagnosisRepo } from "@/lib/repos/supplier-diagnosis.repo";

interface Captured {
  sql: string;
  params: unknown[];
}

function makeRepo(opts: { stored: Record<string, unknown> }) {
  const writes: Captured[] = [];
  const pool = {
    query: async (sql: string, params: unknown[]) => {
      writes.push({ sql, params });
      return [{ affectedRows: 1 }, []];
    },
    execute: async (sql: string, params: unknown[]) => {
      writes.push({ sql, params });
      return [[opts.stored], []];
    },
  };
  // 只用到 query/execute，其余能力与本次写入无关
  return { repo: new SupplierDiagnosisRepo(pool as never), writes };
}

const answers = {
  english_evidence_level: "有英文检测报告或业绩证明",
  english_meeting_capability: "可邮件与表单独立答疑",
  tender_experience: "通过资审但未入围",
  tender_amount_band: "10万至50万美元",
  procurement_frameworks: ["UNGM 联合国采购门户"],
  mandatory_docs: ["营业执照英文版", "ISO体系证书"],
  ungm_status: "已注册基础级(Basic)",
  compliance_governance: "有专岗",
  technical_response: "有技术团队可逐条应答",
  cost_pricing: "有内部成本表",
  incoterms_capability: "会FOB与CIF",
  payment_terms: "可以",
  export_scale: "500万美元以下",
  submission_control: "双人复核",
  deliver_to_site: "可直接发货至项目国",
  service_countries: "德国",
  overseas_companies: "",
  team_discipline: "1至2人有台账",
  target_markets: ["EU", "US"],
};

function stored(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    supplier_id: 18296,
    schema_version: 3,
    score_total: 72.5,
    qual_grade: "B",
    ...over,
  };
}

describe("SupplierDiagnosisRepo V3 写入口径", () => {
  it("写入 target_markets / qual_* / schema_version=3，且不碰 bid_willingness", async () => {
    const { repo, writes } = makeRepo({ stored: stored() });
    const row = await repo.upsertDiagnosis({
      userId: 5,
      supplierId: 18296,
      companyName: "杭州中建工程技术有限公司",
      answers,
      score: { totalScore: 72.5, grade: "B", breakdown: { dimensions: [] } },
      qualification: { grade: "B", breakdown: { missingCount: 1 } },
      ip: "1.2.3.4",
    });

    expect(row.id).toBe(7);
    const insert = writes.find((w) => /INSERT INTO supplier_diagnosis/.test(w.sql))!;
    expect(insert).toBeTruthy();

    // 1) 列口径
    expect(insert.sql).toContain("target_markets");
    expect(insert.sql).toContain("qual_grade");
    expect(insert.sql).toContain("qual_breakdown");
    expect(insert.sql).toContain("schema_version");
    expect(insert.sql).not.toContain("bid_willingness");

    // 2) 关键写值
    expect(insert.params).toContain(DIAGNOSIS_SCHEMA_VERSION);
    expect(insert.params).toContain("EU,US"); // 多选逗号入库
    expect(insert.params.filter((p) => p === "B").length).toBeGreaterThanOrEqual(2); // score_grade + qual_grade + IF 判定

    // 3) 占位符与参数必须一一对应（含 IF(? IS NULL, NULL, NOW()) 的那一个）
    const placeholders = (insert.sql.match(/\?/g) ?? []).length;
    expect(placeholders).toBe(insert.params.length);
  });

  it("未分级（未填目标市场）时 qual_grade 落 NULL，而不是伪造 C 级", async () => {
    const { repo, writes } = makeRepo({ stored: stored({ qual_grade: null }) });
    await repo.upsertDiagnosis({
      userId: 5,
      supplierId: 18296,
      companyName: "杭州中建工程技术有限公司",
      answers: { ...answers, target_markets: [] },
      score: { totalScore: 72.5, grade: "B", breakdown: {} },
      qualification: { grade: null, breakdown: { unscoredReason: "no_target_markets" } },
      ip: null,
    });
    const insert = writes.find((w) => /INSERT INTO supplier_diagnosis/.test(w.sql))!;
    // qual_grade 与 IF 判定都应是 null（params 里 "B" 只可能来自 score_grade）
    expect(insert.params.filter((p) => p === null).length).toBeGreaterThanOrEqual(2);
    expect(insert.sql).toContain("IF(? IS NULL, NULL, NOW())");
  });

  it("回读值与写入不一致时抛错（静默零更新是本仓既有教训）", async () => {
    const { repo } = makeRepo({ stored: stored({ score_total: 60 }) });
    await expect(
      repo.upsertDiagnosis({
        userId: 5,
        supplierId: 18296,
        companyName: "杭州中建工程技术有限公司",
        answers,
        score: { totalScore: 72.5, grade: "B", breakdown: {} },
        qualification: { grade: "B", breakdown: {} },
        ip: null,
      }),
    ).rejects.toThrow(/score snapshot mismatch/);
  });

  it("schema_version 没落到 3 时抛错（影子换表失败要当场暴露）", async () => {
    const { repo } = makeRepo({ stored: stored({ schema_version: 2 }) });
    await expect(
      repo.upsertDiagnosis({
        userId: 5,
        supplierId: 18296,
        companyName: "杭州中建工程技术有限公司",
        answers,
        score: { totalScore: 72.5, grade: "B", breakdown: {} },
        qualification: { grade: "B", breakdown: {} },
        ip: null,
      }),
    ).rejects.toThrow(/schema_version mismatch/);
  });
});
