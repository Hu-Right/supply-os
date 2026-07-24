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
  console.log("✅ 六语言键一致（zh 基准），共", baseKeys.length, "个键 ×", Object.keys(targets).length + 1, "语言");
  process.exit(0);
} else {
  process.exit(1);
}
