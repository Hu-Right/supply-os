/**
 * 多语言列填充口径（D6/D7 回归）
 *
 * 优先级链（唯一实现处 = buildWideRow）：
 *   1. 精选公告的中文 → 人工拆解 description_cn
 *   2. model = same-lang-passthrough（原文即目标语言，管道只存了标题）→ 回填原文
 *   3. 正常译文
 * 历史上判定值写成 'skip-same-lang'（全库不存在该写入值），分支恒不命中，
 * 同语言公告（含全部平台 RFQ）的 description_zh/en 恒空 → 跨语言搜索召不回。
 */
import { describe, it, expect } from "vitest";
import { buildWideRow } from "@/lib/services/search-sync/wide-row-builder";
import { TRANSLATION_MODEL, WIDE_LIMITS } from "@/lib/utils/notice-field-limits";

const base = {
  id: 1, notice_id: "OSRFQ-000000000001", title: "采购光伏组件 10MW",
  reference: "OSRFQ-000000000001", description: "详细描述".repeat(10),
  country: "China", agency: "", notice_type: "RFQ", deadline_sec: 0,
  is_featured: 0, estimated_value: 0, entry_source: "platform",
};

describe("buildWideRow 多语言回填", () => {
  it("same-lang-passthrough 且无译文描述 → 回填原文描述（不再恒空）", () => {
    const row = buildWideRow({ ...base, sync_src_hash: "h" }, new Map(), undefined, {
      zh: { title: "采购光伏组件 10MW", description: "", model: TRANSLATION_MODEL.SAME_LANG },
    });
    expect(row.description_zh).toContain("详细描述");
  });

  it("非直通的空描述不得被原文顶掉（保持空，避免把别的语言内容当译文）", () => {
    const row = buildWideRow({ ...base }, new Map(), undefined, {
      fr: { title: "Titre", description: "", model: "deeplex" },
    });
    expect(row.description_fr).toBe("");
    expect(row.title_fr).toBe("Titre");
  });

  it("正常译文存在时优先用译文，不被原文覆盖", () => {
    const row = buildWideRow({ ...base }, new Map(), undefined, {
      en: { title: "Solar PV", description: "English body", model: "dealy" },
    });
    expect(row.title_en).toBe("Solar PV");
    expect(row.description_en).toBe("English body");
  });

  it("精选公告中文描述走 description_cn（优先级 1，人工拆解结果不被机器译文顶掉）", () => {
    const row = buildWideRow({ ...base, is_featured: 1, description_cn: "人工拆解的中文摘要" }, new Map(), undefined, {
      zh: { title: "中文标题", description: "机器译文描述", model: "dealy" },
    });
    expect(row.description_zh).toBe("人工拆解的中文摘要");
    expect(row.title_zh).toBe("中文标题");
  });

  it("model 判定值来自 TRANSLATION_MODEL 常量，源码不再出现 skip-same-lang", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/services/search-sync/wide-row-builder.ts"),
      "utf8",
    );
    expect(TRANSLATION_MODEL.SAME_LANG).toBe("same-lang-passthrough");
    expect(src).not.toContain("skip-same-lang");
    expect(src).toContain("TRANSLATION_MODEL.SAME_LANG");
  });

  it("所有语言描述列按 WIDE_LIMITS.description、标题按 title 截断", () => {
    const long = "x".repeat(WIDE_LIMITS.description + 500);
    const row = buildWideRow({ ...base, description: long }, new Map(), undefined, {
      fr: { title: "y".repeat(WIDE_LIMITS.title + 10), description: long, model: "dealy" },
    });
    expect(row.description_fr).toHaveLength(WIDE_LIMITS.description);
    expect(row.title_fr).toHaveLength(WIDE_LIMITS.title);
  });
});
