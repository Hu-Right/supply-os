import zh from "../src/core/i18n/zh.json";
import en from "../src/core/i18n/en.json";

const zk = Object.keys(zh);
const ek = Object.keys(en);

const missingInEn = zk.filter((k) => !ek.includes(k));
const missingInZh = ek.filter((k) => !zk.includes(k));

if (missingInEn.length) {
  console.error("❌ en.json 缺少:", missingInEn);
}

if (missingInZh.length) {
  console.error("❌ zh.json 缺少:", missingInZh);
}

if (!missingInEn.length && !missingInZh.length) {
  console.log("✅ 中英键一致，共", zk.length, "个");
  process.exit(0);
} else {
  process.exit(1);
}
