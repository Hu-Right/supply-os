import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve } from "node:path";

// 以 locales/zh/*.json 为键基准（LocaleKey 来源），校验其余语言包键完全一致。
// 脚本位于 scripts/gates/，故需上溯两级回到仓库根再进 src/。
const localesDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/core/i18n/locales",
);
const LANGS = ["zh", "en", "fr", "ru", "es", "ar", "pt"] as const;

function loadLang(lang: string): Record<string, unknown> {
  const dir = resolve(localesDir, lang);
  const merged: Record<string, unknown> = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    Object.assign(merged, JSON.parse(readFileSync(resolve(dir, file), "utf8")));
  }
  return merged;
}

const zh = loadLang("zh");
const baseKeys = Object.keys(zh);

let hasError = false;

// 重复键检测：JSON.parse 会静默 last-wins 吞掉重复键，必须按原始文本逐行扫描。
for (const lang of LANGS) {
  const dir = resolve(localesDir, lang);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const lines = readFileSync(resolve(dir, file), "utf8").split(/\r?\n/);
    const seen = new Map<string, number[]>();
    lines.forEach((line, i) => {
      const m = line.match(/^\s*"((?:[^"\\]|\\.)*)"\s*:/);
      if (!m) return;
      seen.set(m[1], [...(seen.get(m[1]) ?? []), i + 1]);
    });
    const dups = [...seen.entries()].filter(([, lineNos]) => lineNos.length > 1);
    if (dups.length) {
      hasError = true;
      for (const [key, lineNos] of dups) {
        console.error(`❌ ${lang}/${file} 重复键 "${key}"（行 ${lineNos.join(", ")}）`);
      }
    }
  }
}

for (const lang of LANGS.filter((l) => l !== "zh")) {
  const keys = Object.keys(loadLang(lang));
  const missing = baseKeys.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !baseKeys.includes(k));

  if (missing.length) {
    hasError = true;
    console.error(`❌ ${lang} 缺少 ${missing.length} 个键:`, missing);
  }
  if (extra.length) {
    hasError = true;
    console.error(`❌ ${lang} 多出 ${extra.length} 个键:`, extra);
  }
}

// 代码引用完整性：src 里 t("字面量") 引用的键必须在 zh 基准中存在。
// 原本此门禁只校验六语 parity——一个键只要六语「一致地缺失」就放行，
// 抓不到「代码在用、语言包却没有」这类线上只刷 LocaleContext 告警、界面退化成兜底串的缺陷。
function collectReferencedKeys(dir: string, out: Map<string, string[]> = new Map()): Map<string, string[]> {
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
      collectReferencedKeys(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) {
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(/\bt\(\s*"([a-zA-Z0-9_]+)"/g)) {
        const list = out.get(m[1]);
        if (list) list.push(p);
        else out.set(m[1], [p]);
      }
    }
  }
  return out;
}
const baseSet = new Set(baseKeys);
const refs = collectReferencedKeys(resolve(dirname(fileURLToPath(import.meta.url)), "../../src"));
const undefinedRefs = [...refs.keys()].filter((k) => !baseSet.has(k));
if (undefinedRefs.length) {
  hasError = true;
  console.error(`\u274c 代码引用了 ${undefinedRefs.length} 个未在任何语言包定义的 t() 键（运行时只会显示兜底串）：`);
  for (const k of undefinedRefs.sort()) {
    const files = [...new Set(refs.get(k)!)].map((f) => relative(process.cwd(), f)).slice(0, 3);
    console.error(`   - ${k}  \u2190 ${files.join(", ")}`);
  }
}

if (!hasError) {
  // 语言数写在文案里（原写死「六语言」）会在加语言时变成假信息，改成数据驱动。
  console.log("\u2705", LANGS.length, "语言键一致、无重复键（zh 基准），且代码 t() 引用均有定义，共", baseKeys.length, "个键 \u00d7", LANGS.length, "语言");
  process.exit(0);
} else {
  process.exit(1);
}
