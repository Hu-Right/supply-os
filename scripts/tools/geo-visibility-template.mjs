/**
 * 生成某个月的「AI 可见度」记录表（CSV 骨架）
 *
 * @description 20 个固定问题 × 4 个引擎，预填日期/引擎/题号/问题，判定列留空人工填。
 *              问题清单唯一事实源：docs/geo/questions.json。
 *
 * 用法：
 *   node scripts/tools/geo-visibility-template.mjs --month=2026-12
 *   node scripts/tools/geo-visibility-template.mjs --month=2026-12 --force
 *   node scripts/tools/geo-visibility-template.mjs --month=2026-12 --engines=ChatGPT,Kimi
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const QUESTIONS = JSON.parse(readFileSync(path.join(ROOT, "docs/geo/questions.json"), "utf8"));

const DEFAULT_ENGINES = ["ChatGPT", "Perplexity", "Kimi", "豆包"];
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const month = argOf("month", new Date().toISOString().slice(0, 7));
const date = argOf("date", `${month}-01`);
const engines = argOf("engines", DEFAULT_ENGINES.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const out = path.join(ROOT, `docs/geo/ai-visibility-${month}.csv`);

if (existsSync(out) && !args.includes("--force")) {
  console.error(`${out} 已存在；确认要重填请加 --force`);
  process.exit(1);
}

const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const header = ["date", "engine", "qid", "category", "question", "mentioned", "brand_position", "fact_accuracy", "cited_urls", "notes"];
const lines = [header.join(",")];
for (const engine of engines) {
  for (const q of QUESTIONS) {
    lines.push([date, engine, q.id, q.category, q.question, "", "", "", "", ""].map(cell).join(","));
  }
}
writeFileSync(out, `${lines.join("\n")}\n`, "utf8");
console.log(`已生成 ${out}（${engines.length} 引擎 × ${QUESTIONS.length} 问 = ${engines.length * QUESTIONS.length} 行）`);
console.log("判定列填法：mentioned=1/0；brand_position=首推/并列/仅提及/无；fact_accuracy=正确/部分/错误/不适用；cited_urls 用 | 分隔");
