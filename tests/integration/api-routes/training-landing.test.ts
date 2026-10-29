/**
 * GET /api/training/landing 集成测试 — 响应键命名红线（红线②【丙】组第②处收口）
 *
 * @description 出口原本是 `json({ course, schedules })`，两个值都来自 `SELECT *`：
 *              真库实测 training_courses 12 列（8 个带下划线）、training_schedules 11 列
 *              （6 个带下划线），且库里确有 1 行 active 课程 + 5 行期次——这是【丙】组里
 *              唯一真有数据在发 snake 的一处（orders/participants 两表 0 行）。
 *              这里用假仓储跑通路由，钉三件事：
 *              ① wire 键全 camel；② 键集合等于前端已声明的契约（未声明的列不得上网）；
 *              ③ 只改名不改值（DECIMAL 在本池配置下驱动返回字符串，不在本批处理）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// 与 training_courses 的真实 12 列同形（含前端未声明的 sort_order/status/时间戳）
const COURSE_ROW = {
  id: 1,
  name_zh: "国际公共采购研修班",
  name_en: "International Public Procurement Training",
  description_zh: "简介",
  description_en: null,
  unit_price: "3800.00",
  currency: "CNY",
  includes: ["教材", "证书"],
  status: "active",
  sort_order: 0,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-02T00:00:00Z"),
};

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const PAST = "2020-01-05";

const SCHEDULE_ROWS = [
  {
    id: 1, course_id: 1, period_number: 1, start_date: PAST, city: "北京", format: "线下",
    status: "closed", capacity: 30, enrolled_count: 30,
    created_at: new Date("2026-01-01T00:00:00Z"), updated_at: null,
  },
  {
    id: 2, course_id: 1, period_number: 2, start_date: FUTURE, city: "北京", format: "线下",
    status: "open", capacity: 30, enrolled_count: 10,
    created_at: new Date("2026-01-01T00:00:00Z"), updated_at: null,
  },
];

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    trainingRepo: {
      getActiveCourse: async () => COURSE_ROW,
      listSchedules: async () => SCHEDULE_ROWS,
    },
  }),
}));

const snakeKeys = (obj: unknown): string[] =>
  Object.keys(obj as object).filter((k) => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(k));

beforeEach(() => vi.clearAllMocks());

describe("GET /api/training/landing", () => {
  it("course 键集合等于前端已声明的 camelCase 契约，未声明的列不上网", async () => {
    const { GET } = await import("@/app/api/training/landing/route");
    const body = await (await GET(new NextRequest("http://localhost:3000/api/training/landing"))).json();

    expect(Object.keys(body.course).sort()).toEqual(
      ["currency", "descriptionEn", "descriptionZh", "id", "includes", "nameEn", "nameZh", "unitPrice"].sort(),
    );
    expect(snakeKeys(body.course)).toEqual([]);
  });

  it("schedules 元素键集合等于已声明契约；DECIMAL 值原样透传（不改数值形态）", async () => {
    const { GET } = await import("@/app/api/training/landing/route");
    const body = await (await GET(new NextRequest("http://localhost:3000/api/training/landing"))).json();

    expect(body.schedules).toHaveLength(1);
    const s = body.schedules[0];
    expect(Object.keys(s).sort()).toEqual(
      ["capacity", "city", "enrolledCount", "format", "id", "periodNumber", "startDate", "status"].sort(),
    );
    expect(snakeKeys(s)).toEqual([]);
    // 值口径不变：字符串 "3800.00" 仍是字符串（改成 number 会连带把显示变成千分位，属独立批次）
    expect(body.course.unitPrice).toBe("3800.00");
    expect(body.course.includes).toEqual(["教材", "证书"]);
  });

  it("过期期次仍被剔除（改名不得动 keepUpcoming 的行为）", async () => {
    const { GET } = await import("@/app/api/training/landing/route");
    const body = await (await GET(new NextRequest("http://localhost:3000/api/training/landing"))).json();

    expect(body.schedules.map((x: { periodNumber: number }) => x.periodNumber)).toEqual([2]);
  });
});
