/**
 * ITB 招标文件包服务单测（mock pool，不连真库）
 *
 * 覆盖 P1c 关键闸：kind 白名单、发布冻结（核心件不可改/仅 qa_addendum）、
 * 答疑截止（44017 语义）、核心件齐备性（9 件套缺口清单）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  addTenderDocument,
  deleteDraftTenderDocument,
  findMissingCoreDocuments,
  freezeTenderDocuments,
} from "@/lib/services/procurement/tender-documents";

// 文件字节通道走真库（upload_files），单测桩化：只关心 file_key 传递与记录落库
vi.mock("@/lib/services/file-upload", () => ({
  saveProcurementFile: vi.fn(async (p: { filename: string }) => ({ url: `/f/${p.filename}`, filename: p.filename })),
  getProcurementFile: vi.fn(async () => null),
  PROCUREMENT_FILE_FILENAME_RE: /^attach_/,
}));

const NOW = 1795560000;

function makeDb(over: { status?: string; qaDeadlineAt?: number | null; docKinds?: string[] } = {}) {
  const docs: Array<Record<string, unknown>> = (over.docKinds ?? []).map((k) => ({
    project_id: 7, version_no: 1, doc_kind: k, file_key: `attach_7_6_x.${k}`, visibility: "public", published: 1,
  }));
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const s = String(sql);
      if (s.includes("FROM procurement_projects p") && s.includes("b.user_id = ?")) {
        const status = over.status ?? "draft";
        return status === "x" ? [[]] : [[{ id: 7, version_no: 1, status, method: "itb" }]];
      }
      if (s.includes("qa_deadline_at FROM procurement_tender_configs")) {
        return [[{ qa_deadline_at: over.qaDeadlineAt ?? null }]];
      }
      if (s.includes("INSERT INTO procurement_tender_documents")) {
        const p = params as unknown[];
        docs.push({ project_id: 7, doc_kind: p[2], published: Number(p[8]), version_no: Number(p[1]) });
        return [{ insertId: docs.length }];
      }
      if (s.includes("SELECT DISTINCT doc_kind FROM procurement_tender_documents")) {
        return [docs.map((d) => ({ doc_kind: d.doc_kind }))];
      }
      if (s.includes("DELETE FROM procurement_tender_documents")) {
        const idx = docs.findIndex((d) => d.id === Number(params[0]));
        if (idx >= 0 && docs[idx].published === 0) { docs.splice(idx, 1); return [{ affectedRows: 1 }]; }
        return [{ affectedRows: 0 }];
      }
      if (s.includes("UPDATE procurement_tender_documents SET version_no")) {
        for (const d of docs) if (d.published === 0) { d.version_no = params[0]; d.published = 1; }
        return [{ affectedRows: docs.length }];
      }
      return [[]];
    }),
  } as unknown as Parameters<typeof addTenderDocument>[0];
  return { db, docs };
}

const file = { filename: "itb-01.pdf", contentType: "application/pdf", buffer: Buffer.from("doc") };

describe("addTenderDocument 上传闸", () => {
  let ctx: ReturnType<typeof makeDb>;
  beforeEach(() => { ctx = makeDb(); });

  it("docKind 白名单外 → kind_invalid", async () => {
    const r = await addTenderDocument(ctx.db, { projectId: 7, buyerUserId: 6, docKind: "hacker", ...file });
    expect(r).toMatchObject({ ok: false, reason: "kind_invalid" });
  });

  it("草稿期上传 9 件套 → 落库 version=0/published=0", async () => {
    const r = await addTenderDocument(ctx.db, { projectId: 7, buyerUserId: 6, docKind: "itb_notice", ...file });
    expect(r.ok).toBe(true);
    expect(ctx.docs[0]).toMatchObject({ doc_kind: "itb_notice", published: 0, version_no: 0 });
  });

  it("发布后核心件 → frozen；答疑期内 qa_addendum 放行且 published=1", async () => {
    const pub = makeDb({ status: "published", qaDeadlineAt: NOW + 100 });
    const core = await addTenderDocument(pub.db, { projectId: 7, buyerUserId: 6, docKind: "tech_spec", ...file, at: NOW });
    expect(core).toMatchObject({ ok: false, reason: "frozen" });
    const qa = await addTenderDocument(pub.db, { projectId: 7, buyerUserId: 6, docKind: "qa_addendum", ...file, at: NOW + 10 });
    expect(qa.ok).toBe(true);
    expect(pub.docs.at(-1)).toMatchObject({ doc_kind: "qa_addendum", published: 1, version_no: 1 });
  });

  it("答疑截止后 qa_addendum → qa_closed（44017 语义）", async () => {
    const pub = makeDb({ status: "published", qaDeadlineAt: NOW - 1 });
    const r = await addTenderDocument(pub.db, { projectId: 7, buyerUserId: 6, docKind: "qa_addendum", ...file, at: NOW });
    expect(r).toMatchObject({ ok: false, reason: "qa_closed" });
  });
});

describe("findMissingCoreDocuments / freeze / delete", () => {
  it("9 件套缺口清单", async () => {
    const ctx = makeDb({ docKinds: ["itb_notice", "tech_spec"] });
    const missing = await findMissingCoreDocuments(ctx.db, 7);
    expect(missing).toContain("itb_instructions");
    expect(missing).toHaveLength(7);
    expect(missing).not.toContain("itb_notice");
  });

  it("冻结：草稿件挂版本置 published；草稿期可删、冻结后不可删", async () => {
    const ctx = makeDb();
    await addTenderDocument(ctx.db, { projectId: 7, buyerUserId: 6, docKind: "itb_notice", ...file });
    const frozen = await freezeTenderDocuments(ctx.db, 7, 1, NOW);
    expect(frozen).toBe(1);
    expect(ctx.docs[0]).toMatchObject({ published: 1, version_no: 1 });
    const del = await deleteDraftTenderDocument(ctx.db, 7, 6, 1);
    expect(del).toMatchObject({ ok: true, deleted: false });
  });
});
