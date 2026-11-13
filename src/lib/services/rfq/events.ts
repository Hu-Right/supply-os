/**
 * RFQ 事件流写入
 * @module lib/services/rfq/events
 *
 * @description 所有状态/版本/邀约/报价/授标变化都写一条 append-only 事件，
 *              作为「时间线 UI」与「审计」的唯一来源，也是投影补偿的重放依据。
 *              本模块只负责写，不解释语义；语义由 lifecycle / 各能力模块决定。
 */
import type { DemandActor, DemandStatus } from "@/shared/constants/rfq-demand";

/** 最小可写接口：兼容 Pool 与 PoolConnection（事务内共用） */
export interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}

export interface DemandEventInput {
  demandId: number;
  /** created/submitted/claimed/approved/rejected/published/closed/edited/invited/quoted/awarded/qa */
  type: string;
  actor: DemandActor;
  actorId?: number | null;
  fromStatus?: DemandStatus | null;
  toStatus?: DemandStatus | null;
  payload?: Record<string, unknown> | null;
  /** 秒级时间戳；缺省取当前时间 */
  at?: number;
}

/**
 * 追加一条事件。调用方负责事务边界（通常与状态变更同事务）。
 */
export async function appendDemandEvent(
  db: Queryable,
  input: DemandEventInput,
): Promise<void> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  await db.query(
    `INSERT INTO rfq_demand_event
       (demand_id, type, actor_type, actor_id, from_status, to_status, payload, at_sec)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.demandId,
      input.type,
      input.actor,
      input.actorId ?? null,
      input.fromStatus ?? null,
      input.toStatus ?? null,
      input.payload ? JSON.stringify(input.payload) : null,
      at,
    ],
  );
}
