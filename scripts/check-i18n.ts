import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import zh from "../src/core/i18n/zh.json";
import en from "../src/core/i18n/en.json";
import fr from "../src/core/i18n/fr.json";
import ru from "../src/core/i18n/ru.json";
import es from "../src/core/i18n/es.json";
import ar from "../src/core/i18n/ar.json";

// 以 zh.json 为键基准（LocaleKey 来源），校验其余语言包键完全一致。
const baseKeys = Object.keys(zh);
const targets: Record<string, Record<string, unknown>> = { en, fr, ru, es, ar };

let hasError = false;

// 重复键检测：JSON.parse/import 会静默 last-wins 吞掉重复键，必须按原始文本逐行扫描。
const i18nDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/core/i18n");
for (const lang of ["zh", "en", "fr", "ru", "es", "ar"]) {
  const lines = readFileSync(resolve(i18nDir, `${lang}.json`), "utf8").split(/\r?\n/);
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
      console.error(`❌ ${lang}.json 重复键 "${key}"（行 ${lineNos.join(", ")}）`);
    }
  }
}

for (const [lang, dict] of Object.entries(targets)) {
  const keys = Object.keys(dict);
  const missing = baseKeys.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !baseKeys.includes(k));

  if (missing.length) {
    hasError = true;
    console.error(`❌ ${lang}.json 缺少 ${missing.length} 个键:`, missing);
  }
  if (extra.length) {
    hasError = true;
    console.error(`❌ ${lang}.json 多出 ${extra.length} 个键:`, extra);
  }
}

if (!hasError) {
  console.log("✅ 六语言键一致且无重复键（zh 基准），共", baseKeys.length, "个键 ×", Object.keys(targets).length + 1, "语言");
  process.exit(0);
} else {
  process.exit(1);
}
