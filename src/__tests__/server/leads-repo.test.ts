// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { LeadsRepo } from "../../../server/repos/leads.repo";

/** Create a mock pool */
function createPool(queryResults: any[] = []) {
  let callIndex = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const rows = queryResults[callIndex] ?? [];
      callIndex++;
      return Promise.resolve([rows]);
    }),
    execute: vi.fn().mockResolvedValue([[]]),
  } as any;
}

// ─── LeadsRepo ─────────────────────────────────────────────────────────────
describe("LeadsRepo", () => {
  it("listAppointments returns rows ordered by created_at desc", async () => {
    const appointments = [
      { appointment_key: "APT-2", company_name: "Company B", created_at: new Date("2026-08-02") },
      { appointment_key: "APT-1", company_name: "Company A", created_at: new Date("2026-08-01") },
    ];
    const pool = createPool([appointments]);
    const repo = new LeadsRepo(pool);
    const rows = await repo.listAppointments();
    expect(rows).toHaveLength(2);
    expect(rows[0].appointment_key).toBe("APT-2");
    expect(String(pool.query.mock.calls[0][0])).toContain("ORDER BY created_at DESC");
    expect(String(pool.query.mock.calls[0][0])).toContain("LIMIT 200");
  });

  it("findByKey returns the first row or null", async () => {
    const appointment = { appointment_key: "APT-1", company_name: "Test Co" };
    const pool = createPool([[appointment], []]);
    const repo = new LeadsRepo(pool);
    expect(await repo.findByKey("APT-1")).toMatchObject({ appointment_key: "APT-1" });
    expect(await repo.findByKey("NOT-EXIST")).toBeNull();
    expect(pool.query.mock.calls[0][1]).toEqual(["APT-1"]);
    expect(String(pool.query.mock.calls[0][0])).toContain("WHERE appointment_key = ?");
  });

  it("updateFollowUpLogs executes UPDATE with correct params", async () => {
    const pool = createPool();
    const repo = new LeadsRepo(pool);
    const logs = JSON.stringify([{ date: "2026-08-01", content: "Initial contact" }]);
    await repo.updateFollowUpLogs("APT-1", logs, "contacted");
    expect(pool.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.execute.mock.calls[0];
    expect(String(sql)).toContain("UPDATE ungm_1v1_appointments");
    expect(String(sql)).toContain("SET follow_up_logs = ?, status = ?");
    expect(params).toEqual([logs, "contacted", "APT-1"]);
  });
});
