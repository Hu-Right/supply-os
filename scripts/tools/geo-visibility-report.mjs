/**
 * 汇总某个月的「AI 可见度」记录表
 *
 * @description 读取 ai-visibility-YYYY-MM.csv，输出：出现率（整体/引擎/类别）、
 *              事实正确率、引用 URL 去重数与 Top 域名、未测行数。
 *              只做统计，不做判定——判定由人工在 CSV 里填。
 *
 * 用法：
 *   node scripts/tools/geo-visibility-report.mjs --file=docs/geo/ai-visibility-2026-12.csv
 *   node scripts/tools/geo-visibility-report.mjs --dir=docs/geo   # 汇总目录下全部月份
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

/** 极简 CSV 解析：支持双引号包裹与 "" 转义 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const pct = (n, d) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);
const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || "";
  }
};

function summarize(file) {
  const rows = parseCsv(readFileSync(file, "utf8"));
  const header = rows.shift();
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const records = rows.map((r) => ({
    engine: r[idx.engine] || "?",
    category: r[idx.category] || "?",
    mentioned: (r[idx.mentioned] || "").trim(),
    accuracy: (r[idx.fact_accuracy] || "").trim(),
    urls: (r[idx.cited_urls] || "").split("|").map((s) => s.trim()).filter(Boolean),
    notes: (r[idx.notes] || "").trim(),
  }));
  const tested = records.filter((r) => r.mentioned !== "");
  const mentioned = tested.filter((r) => r.mentioned === "1");
  const accurate = mentioned.filter((r) => r.accuracy === "正确" || r.accuracy === "部分");
  const urls = [...new Set(mentioned.flatMap((r) => r.urls))];
  const domains = new Map();
  for (const u of urls) {
    const d = hostOf(u);
    if (d) domains.set(d, (domains.get(d) || 0) + 1);
  }

  console.log(`\n## ${path.basename(file)}`);
  console.log(`- 行数：${records.length}（已测 ${tested.length}，未测 ${records.length - tested.length}）`);
  console.log(`- 品牌出现率：${mentioned.length}/${tested.length} = ${pct(mentioned.length, tested.length)}`);
  console.log(`- 事实正确率（提及的里面）：${accurate.length}/${mentioned.length} = ${pct(accurate.length, mentioned.length)}`);
  console.log(`- 引用 URL：${urls.length} 个；域名 Top：${[...domains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d, n]) => `${d}(${n})`).join("、") || "—"}`);

  const byEngine = new Map();
  for (const r of tested) {
    const s = byEngine.get(r.engine) || { n: 0, m: 0 };
    s.n += 1;
    if (r.mentioned === "1") s.m += 1;
    byEngine.set(r.engine, s);
  }
  console.log(`- 分引擎：${[...byEngine.entries()].map(([e, s]) => `${e} ${s.m}/${s.n} ${pct(s.m, s.n)}`).join("；")}`);

  const byCat = new Map();
  for (const r of tested) {
    const s = byCat.get(r.category) || { n: 0, m: 0 };
    s.n += 1;
    if (r.mentioned === "1") s.m += 1;
    byCat.set(r.category, s);
  }
  console.log(`- 分类别：${[...byCat.entries()].map(([c, s]) => `${c} ${s.m}/${s.n}`).join("；")}`);

  const withNote = tested.filter((r) => r.notes);
  if (withNote.length > 0) console.log(`- 备注行：${withNote.length}（详见 CSV notes 列）`);
}

const fileArg = argOf("file", "");
const dirArg = argOf("dir", "");
if (fileArg) {
  summarize(path.resolve(ROOT, fileArg));
} else if (dirArg) {
  const dir = path.resolve(ROOT, dirArg);
  const files = readdirSync(dir).filter((f) => /^ai-visibility-\d{4}-\d{2}\.csv$/.test(f)).sort();
  if (files.length === 0) {
    console.error(`${dir} 下没有 ai-visibility-YYYY-MM.csv`);
    process.exit(1);
  }
  for (const f of files) summarize(path.join(dir, f));
} else {
  console.error("用法：node scripts/tools/geo-visibility-report.mjs --file=docs/geo/ai-visibility-2026-12.csv 或 --dir=docs/geo");
  process.exit(1);
}
