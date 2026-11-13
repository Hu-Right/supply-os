/**
 * RFQ 答疑（Q&A）
 * @module lib/services/rfq/qa
 *
 * @description 采购方与供应商在报价期内的澄清通道。竞品的通行做法是"公开提问 + 统一答复"，
 *              既减少重复询问，也把口径固化下来（答复对所有可见方生效）。
 *              规则：
 *              - 仅 published 且未截止可提问；
 *              - 采购方不能自问自答；
 *              - 答复仅采购方（需求 owner）可写，写后对全部可见方展示；
 *              - `visibility='private'` 的提问只对提问者与采购方可见。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { DEMAND_STATUS } from "@/shared/constants/rfq-demand";

export interface QaItem {
  id: number;
  question: string;
  answer: string;
  askedByMe: boolean;
  answeredAt: number | null;
  createdAt: number | null;
}

interface QaRow extends RowDataPacket {
  id: number;
  asker_user_id: number | null;
  question: string;
  answer: string | null;
  answered_at: number | null;
  created_at: number | null;
  visibility: string;
}

interface DemandQaState extends RowDataPacket {
  buyer_user_id: number;
  status: string;
  close_at: number | null;
}

export async function listQa(
  db: Pool,
  demandId: number,
  viewerUserId: number | null,
): Promise<QaItem[]> {
  const [rows] = await db.query(
    `SELECT id, asker_user_id, question, answer, answered_at, created_at, visibility
       FROM rfq_qa
      WHERE demand_id = ?
        AND (visibility = 'public' OR asker_user_id = ?)
      ORDER BY id ASC
      LIMIT 200`,
    [demandId, viewerUserId ?? -1],
  );
  return (rows as QaRow[]).map((r) => ({
    id: Number(r.id),
    question: String(r.question ?? ""),
    answer: String(r.answer ?? ""),
    askedByMe: viewerUserId != null && Number(r.asker_user_id) === viewerUserId,
    answeredAt: r.answered_at == null ? null : Number(r.answered_at),
    createdAt: r.created_at == null ? null : Number(r.created_at),
  }));
}

async function loadDemand(db: Pool, demandId: number): Promise<DemandQaState | null> {
  const [rows] = await db.query(
    "SELECT buyer_user_id, status, close_at FROM rfq_demand WHERE id = ? LIMIT 1",
    [demandId],
  );
  return ((rows as DemandQaState[])[0] as DemandQaState | undefined) ?? null;
}

export type AskResult =
  | { ok: true; id: number }
  | { ok: false; reason: "not_found" | "not_open" | "self" | "invalid" };

export async function askQuestion(
  db: Pool,
  input: { demandId: number; userId: number; question: string; visibility?: "public" | "private"; at?: number },
): Promise<AskResult> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const question = String(input.question ?? "").trim().slice(0, 2000);
  if (question.length < 10) return { ok: false, reason: "invalid" };

  const demand = await loadDemand(db, input.demandId);
  if (!demand) return { ok: false, reason: "not_found" };
  if (Number(demand.buyer_user_id) === input.userId) return { ok: false, reason: "self" };
  if (String(demand.status) !== DEMAND_STATUS.PUBLISHED) return { ok: false, reason: "not_open" };
  if (demand.close_at != null && Number(demand.close_at) <= at) return { ok: false, reason: "not_open" };

  const [result] = await db.query(
    `INSERT INTO rfq_qa (demand_id, asker_user_id, question, visibility, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [input.demandId, input.userId, question, input.visibility === "private" ? "private" : "public", at],
  );
  return { ok: true, id: Number((result as { insertId?: number }).insertId ?? 0) };
}

export type AnswerResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "forbidden" | "invalid" | "already_answered" };

export async function answerQuestion(
  db: Pool,
  input: { demandId: number; qaId: number; buyerUserId: number; answer: string; at?: number },
): Promise<AnswerResult> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const answer = String(input.answer ?? "").trim().slice(0, 2000);
  if (!answer) return { ok: false, reason: "invalid" };

  const demand = await loadDemand(db, input.demandId);
  if (!demand) return { ok: false, reason: "not_found" };
  if (Number(demand.buyer_user_id) !== input.buyerUserId) return { ok: false, reason: "forbidden" };

  const [rows] = await db.query(
    "SELECT answer FROM rfq_qa WHERE id = ? AND demand_id = ? LIMIT 1",
    [input.qaId, input.demandId],
  );
  const row = (rows as { answer: string | null }[])[0];
  if (!row) return { ok: false, reason: "not_found" };
  if (row.answer) return { ok: false, reason: "already_answered" };

  await db.query(
    "UPDATE rfq_qa SET answer = ?, answered_by = ?, answered_at = ? WHERE id = ? AND demand_id = ?",
    [answer, input.buyerUserId, at, input.qaId, input.demandId],
  );
  return { ok: true };
}
