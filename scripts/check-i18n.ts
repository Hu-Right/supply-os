import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// 以 locales/zh/*.json 为键基准（LocaleKey 来源），校验其余语言包键完全一致。
const localesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/core/i18n/locales");
const LANGS = ["zh", "en", "fr", "ru", "es", "ar"] as const;

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

if (!hasError) {
  console.log("✅ 六语言键一致且无重复键（zh 基准），共", baseKeys.length, "个键 ×", LANGS.length, "语言");
  process.exit(0);
} else {
  process.exit(1);
}
