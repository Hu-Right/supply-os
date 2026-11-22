/**
 * 评审打分/双信封开封服务单测（mock pool，不连真库）
 *
 * 覆盖 P1b 关键闸：模板缺失/维度越界/分值越权 → 拒绝；商务封阶段闸；
 * 技术门槛线开封闸；70/30 综合分公式。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveEvaluations, openFinancialEnvelope, computeComprehensiveRanking } from "@/lib/services/procurement/evaluations";
import { EVAL_TEMPLATE_PRESET_70_30 } from "@/shared/constants/procurement";

const NOW = 1795560000;

/** 轻量内存库：按 SQL 片段路由到状态存储 */
function makeDb() {
  const state = {
    project: {
      id: 7, version_no: 1, status: "published", method: "rfp",
      buyer_id: 1, reference: "OSPR-2026-000007", notice_pk: null,
    },
    buyerUser: 6,
    tender: { id: 3, status: "closed", opened_ts: NOW },
    config: { eval_template: JSON.stringify(EVAL_TEMPLATE_PRESET_70_30) },
    responses: new Map<number, { id: number; status: string; supplier_id: number; price_total: number }>(),
    evaluations: new Map<string, { score: number | null; weight: number | null }>(),
    finOpen: new Set<number>(),
  };
  state.responses.set(101, { id: 101, status: "submitted", supplier_id: 53, price_total: 100000 });
  state.responses.set(102, { id: 102, status: "submitted", supplier_id: 54, price_total: 80000 });

  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const s = String(sql);
      if (s.includes("FROM procurement_projects p") && s.includes("b.user_id = ?")) {
        return state.project.method === "rfp" && params[1] === state.buyerUser ? [[state.project]] : [[]];
      }
      if (s.includes("FROM procurement_tender_configs WHERE project_id")) {
        return [[{ eval_template: state.config.eval_template }]];
      }
      if (s.includes("FROM procurement_tenders") || s.includes("FROM procurement_tenders t")) {
        return [[state.tender]];
      }
      if (s.includes("FROM procurement_responses WHERE id = ?")) {
        const r = state.responses.get(Number(params[0]));
        return [r ? [{ id: r.id, status: r.status }] : []];
      }
      if (s.includes("FROM procurement_envelope_openings WHERE response_id = ?")) {
        return [state.finOpen.has(Number(params[0])) ? [{ id: 1 }] : []];
      }
      if (s.includes("stage = 'technical'") && s.includes("SUM(score)")) {
        let total = 0; let cnt = 0;
        for (const [k, v] of state.evaluations) {
          if (k.startsWith(`${Number(params[0])}|technical`)) { total += Number(v.score ?? 0); cnt++; }
        }
        return [[{ total, cnt }]];
      }
      if (s.includes("INSERT INTO procurement_evaluations")) {
        const [pid, ver, tid, rid, stage, dim, score] = params as number[];
        state.evaluations.set(`${rid}|${stage}|${dim}`, { score: score == null ? null : Number(score), weight: null });
        return [{ affectedRows: 1 }];
      }
      if (s.includes("INSERT INTO procurement_envelope_openings")) {
        state.finOpen.add(Number((params as number[])[2]));
        return [{ affectedRows: 1 }];
      }
      if (s.includes("INSERT INTO procurement_events")) return [{ affectedRows: 1 }];
      if (s.includes("SELECT id, status FROM procurement_responses WHERE id = ? AND project_id")) {
        const r = state.responses.get(Number(params[0]));
        return [r ? [{ id: r.id, status: r.status }] : []];
      }
      if (s.includes("FROM procurement_responses r") && s.includes("JOIN supplier")) {
        return [[...state.responses.values()].map((r) => ({
          id: r.id, supplier_id: r.supplier_id, status: r.status, company: `公司${r.supplier_id}`,
          price_total: r.price_total,
        }))];
      }
      if (s.includes("FROM users WHERE supplier_id")) return [[{ user_id: 76 }]];
      return [[]];
    }),
  } as unknown as Parameters<typeof saveEvaluations>[0];
  return { db, state };
}

describe("saveEvaluations 阶段与分值闸", () => {
  let ctx: ReturnType<typeof makeDb>;
  beforeEach(() => { ctx = makeDb(); });

  const tech = (dim: string, score: number) => ({ stage: "technical", dimensionKey: dim, score });

  it("无冻结模板 → template_missing（44018 语义）", async () => {
    ctx.state.config.eval_template = "";
    const r = await saveEvaluations(ctx.db, {
      projectId: 7, buyerUserId: 6, responseId: 101,
      entries: [tech("solution_fitness", 20)],
    });
    expect(r).toMatchObject({ ok: false, reason: "template_missing" });
  });

  it("维度不在模板内 → dimension_invalid；分值超权重 → score_out_of_range", async () => {
    expect(await saveEvaluations(ctx.db, {
      projectId: 7, buyerUserId: 6, responseId: 101, entries: [tech("hacker_dim", 5)],
    })).toMatchObject({ ok: false, reason: "dimension_invalid" });
    expect(await saveEvaluations(ctx.db, {
      projectId: 7, buyerUserId: 6, responseId: 101, entries: [tech("solution_fitness", 99)],
    })).toMatchObject({ ok: false, reason: "score_out_of_range" });
  });

  it("商务分在开封前 → stage_not_permitted（44019 语义）；开封后放行", async () => {
    expect(await saveEvaluations(ctx.db, {
      projectId: 7, buyerUserId: 6, responseId: 101,
      entries: [{ stage: "financial", dimensionKey: "solution_fitness", score: 10 }],
    })).toMatchObject({ ok: false, reason: "stage_not_permitted" });
    ctx.state.finOpen.add(101);
    const r = await saveEvaluations(ctx.db, {
      projectId: 7, buyerUserId: 6, responseId: 101,
      entries: [{ stage: "financial", dimensionKey: "solution_fitness", score: 10 }],
    });
    expect(r).toMatchObject({ ok: true, saved: 1 });
  });

  it("技术分合法落库（upsert 覆盖同维）", async () => {
    expect(await saveEvaluations(ctx.db, {
      projectId: 7, buyerUserId: 6, responseId: 101, entries: [tech("solution_fitness", 25), tech("track_record", 15)],
    })).toMatchObject({ ok: true, saved: 2 });
  });
});

describe("openFinancialEnvelope 技术门槛闸", () => {
  let ctx: ReturnType<typeof makeDb>;
  beforeEach(() => {
    ctx = makeDb();
    ctx.state.evaluations.set("101|technical|solution_fitness", { score: 25, weight: null });
    ctx.state.evaluations.set("101|technical|track_record", { score: 15, weight: null });
  });

  it("技术总分 ≥ 门槛线（40 ≥ 42? 40<42 → 拒）→ tech_not_passed", async () => {
    // 25+15=40 < 42（预设门槛）
    expect(await openFinancialEnvelope(ctx.db, { projectId: 7, buyerUserId: 6, responseId: 101 }))
      .toMatchObject({ ok: false, reason: "tech_not_passed" });
  });

  it("达标后开封成功且幂等", async () => {
    ctx.state.evaluations.set("101|technical|plan_team", { score: 10, weight: null }); // 50 ≥ 42
    const r = await openFinancialEnvelope(ctx.db, { projectId: 7, buyerUserId: 6, responseId: 101 });
    expect(r).toMatchObject({ ok: true });
    const again = await openFinancialEnvelope(ctx.db, { projectId: 7, buyerUserId: 6, responseId: 101 });
    expect(again).toMatchObject({ ok: true, openedAt: (r as { ok: true; openedAt: number }).openedAt });
  });

  it("未评技术分 → stage_not_permitted", async () => {
    expect(await openFinancialEnvelope(ctx.db, { projectId: 7, buyerUserId: 6, responseId: 102 }))
      .toMatchObject({ ok: false, reason: "stage_not_permitted" });
  });
});

describe("computeComprehensiveRanking 70/30 综合分", () => {
  it("仅已开封且达标者出财务分与总分；S = T + 30×Pmin/P", async () => {
    const { db, state } = makeDb();
    state.evaluations.set("101|technical|solution_fitness", { score: 25, weight: null });
    state.evaluations.set("101|technical|track_record", { score: 20, weight: null }); // T=45 ≥ 42
    state.evaluations.set("102|technical|solution_fitness", { score: 25, weight: null });
    state.evaluations.set("102|technical|track_record", { score: 20, weight: null }); // T=45
    state.finOpen.add(101); // 102 未开封
    const rows = await computeComprehensiveRanking(db, 7);
    const r101 = rows.find((r) => r.responseId === 101);
    const r102 = rows.find((r) => r.responseId === 102);
    // 101 开封：P = 30×80000/100000 = 24（Pmin 取已开封集合中最小价=101 自己的 100000）
    // 注意：Pmin 只在已开封集合内取 —— 只有 101 开封 → Pmin=100000 → P=30
    expect(r101?.financialScore).toBeCloseTo(30, 2);
    expect(r101?.totalScore).toBeCloseTo(75, 2);
    // 102 未开封：价格/财务分/总分全 null，但技术分可见
    expect(r102?.priceTotal).toBeNull();
    expect(r102?.financialScore).toBeNull();
    expect(r102?.technicalTotal).toBe(45);
  });
});
