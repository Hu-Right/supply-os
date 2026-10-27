import { describe, expect, it } from "vitest";
import { classifyDeadline } from "@/lib/services/notice-deadline/classify";

const NOW = Math.floor(Date.UTC(2026, 9, 20) / 1000); // 2026-10-20
const ts = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000);

const base = {
  deadline: null as string | null,
  deadlineTs: null as number | null,
  publishedDate: null as string | null,
  title: null as string | null,
  description: null as string | null,
  country: null as string | null,
};

describe("classifyDeadline", () => {
  it("2125-12-31 西班牙哨兵 → placeholder，不是 99 年合同", () => {
    const v = classifyDeadline(
      {
        ...base,
        deadline: "2125-12-31 00:00",
        deadlineTs: ts("2125-12-31"),
        country: "Spain",
        title: "Suministro de medicamentos exclusivos",
      },
      NOW,
    );
    expect(v.state).toBe("placeholder");
    expect(v.type).toBe("bid");
    expect(v.effectiveTs).toBeNull();
    expect(v.confidence).toBeGreaterThan(90);
  });

  it("2050 巴西 credenciamento，月日=发布日 → typo_suspect", () => {
    const v = classifyDeadline(
      {
        ...base,
        deadline: "2050-09-30",
        deadlineTs: ts("2050-09-30"),
        publishedDate: "2026-09-30",
        country: "Brazil",
        title: "CREDENCIAMENTO DE PESSOAS FÍSICAS E JURÍDICAS",
      },
      NOW,
    );
    expect(v.state).toBe("typo_suspect");
    expect(v.type).toBe("registration");
    expect(v.effectiveTs).toBeNull();
    expect(v.confidence).toBe(80);
  });

  it("2226 西班牙，月日接近发布日 → typo_suspect", () => {
    const v = classifyDeadline(
      {
        ...base,
        deadline: "28-Sep-2226 14:00",
        deadlineTs: ts("2226-09-28"),
        publishedDate: "2026-09-08",
        country: "Spain",
        title: "Suministro agregado de material para cirugia oftálmica",
      },
      NOW,
    );
    expect(v.state).toBe("typo_suspect");
    expect(v.type).toBe("bid");
    expect(v.confidence).toBe(80);
  });

  it("2039 法国 SAD → known / framework_end，不是投标截止", () => {
    const v = classifyDeadline(
      {
        ...base,
        deadline: "29-Jun-2039 23:59",
        deadlineTs: ts("2039-06-29"),
        publishedDate: "2026-06-29",
        country: "France",
        title: "SAD 1 : Approvisionnement MPUP et AC",
        description: "Système d'acquisition dynamique",
      },
      NOW,
    );
    expect(v.state).toBe("known");
    expect(v.type).toBe("framework_end");
    // 文本写了 23:59 就按 23:59 算，不抹成午夜（无偏移标记 ⇒ assumed_utc）
    expect(v.effectiveTs).toBe(Math.floor(Date.UTC(2039, 5, 29, 23, 59) / 1000));
    expect(v.timezoneSource).toBe("assumed_utc");
    expect(v.confidence).toBe(70);
  });

  it("2050 加拿大 Supply Arrangement → known / framework_end", () => {
    const v = classifyDeadline(
      {
        ...base,
        deadline: "2050-09-30 10:00 (UTC-04:00)",
        deadlineTs: ts("2050-09-30"),
        publishedDate: "2024-09-25",
        country: "Canada",
        title: "W684H-240211 - Grass Cutting Supply Arrangement",
      },
      NOW,
    );
    expect(v.state).toBe("known");
    expect(v.type).toBe("framework_end");
    // 显式偏移换算：10:00 @ UTC-04:00 = 14:00 UTC（旧断言午夜是时分被丢掉时的残留）
    expect(v.effectiveTs).toBe(Math.floor(Date.UTC(2050, 8, 30, 14, 0) / 1000));
    expect(v.timezone).toBe("GMT-04:00");
    expect(v.timezoneSource).toBe("explicit");
  });

  it("2100 加拿大框架 → 30 年以上，placeholder", () => {
    const v = classifyDeadline(
      {
        ...base,
        deadline: "2100-12-31 14:00 (UTC-05:00)",
        deadlineTs: ts("2100-12-31"),
        publishedDate: "2024-05-15",
        country: "Canada",
        title: "RFSA - Exhibits",
      },
      NOW,
    );
    expect(v.state).toBe("placeholder");
    expect(v.type).toBe("framework_end");
    expect(v.effectiveTs).toBeNull();
  });

  it("未公布 / deadline_ts=0 → unknown", () => {
    const v = classifyDeadline(
      { ...base, deadline: "未公布", deadlineTs: 0, country: "Brazil" },
      NOW,
    );
    expect(v.state).toBe("unknown");
    expect(v.effectiveTs).toBeNull();
    expect(v.confidence).toBe(100);
  });

  it("正常未来截止日 → known / bid", () => {
    const v = classifyDeadline(
      {
        ...base,
        deadline: "2026-11-15 00:00",
        deadlineTs: ts("2026-11-15"),
        publishedDate: "2026-10-01",
        country: "France",
        title: "Fourniture de matériel",
      },
      NOW,
    );
    expect(v.state).toBe("known");
    expect(v.type).toBe("bid");
    expect(v.effectiveTs).toBe(ts("2026-11-15"));
    expect(v.confidence).toBe(100);
  });

  it("毫秒时间戳会归一为秒", () => {
    const v = classifyDeadline(
      {
        ...base,
        deadline: "2026-11-15 00:00",
        deadlineTs: ts("2026-11-15") * 1000,
        publishedDate: "2026-10-01",
      },
      NOW,
    );
    expect(v.effectiveTs).toBe(ts("2026-11-15"));
  });

  it("2037 奥地利 Prüfsystem → framework_end，不是笔误", () => {
    const v = classifyDeadline(
      {
        ...base,
        deadline: "31-Dec-2037 10:00 (GMT +0.00)",
        deadlineTs: ts("2037-12-31"),
        publishedDate: "2026-07-03",
        country: "Austria",
        title: "Prüfsystem Fernwärmezähler",
      },
      NOW,
    );
    expect(v.state).toBe("known");
    expect(v.type).toBe("framework_end");
  });

  it("2046 法国 MARCHALIM → framework_end", () => {
    const v = classifyDeadline(
      {
        ...base,
        deadline: "2046-07-13 00:00 (UTC+02:00)",
        deadlineTs: ts("2046-07-13"),
        publishedDate: "2026-07-14",
        country: "France",
        title: "MARCHALIM-2 - PONT DE BUIS - Besoins en restauration collective",
      },
      NOW,
    );
    expect(v.type).toBe("framework_end");
    expect(v.state).toBe("known");
  });

  it("普通 'framework agreement' 招标仍是 bid，不因标题含 framework 被降级", () => {
    const v = classifyDeadline(
      {
        ...base,
        deadline: "2026-12-01 00:00",
        deadlineTs: ts("2026-12-01"),
        publishedDate: "2026-10-01",
        country: "United Kingdom",
        title: "Framework agreement for IT support services",
        description: "A four-year framework agreement with a single supplier.",
      },
      NOW,
    );
    expect(v.state).toBe("known");
    expect(v.type).toBe("bid");
  });

  it("2026 年建立 Dynamic Market 的招标仍是 bid，不是框架结束日", () => {
    const v = classifyDeadline(
      {
        ...base,
        deadline: "2026-11-30 12:00",
        deadlineTs: ts("2026-11-30"),
        publishedDate: "2026-10-01",
        country: "United Kingdom",
        title: "LEO Academy Trust - Dynamic Market 2026",
        description: "Establishment of a Dynamic Market pursuant to section 34 of the Procurement Act 2023.",
      },
      NOW,
    );
    expect(v.state).toBe("known");
    expect(v.type).toBe("bid");
  });
});
