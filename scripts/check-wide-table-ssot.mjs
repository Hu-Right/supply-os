import fs from "node:fs";
import path from "node:path";

/**
 * 架构红线守卫：宽表单一写入者 + 口径单一事实源
 * @see ARCHITECTURE.md 红线 #6
 * @see docs/superpowers/specs/2026-09-20-宽表统一执行标准与平台公告数据适配设计.md
 *
 * 规则：
 *   I1) src/lib/**（db/migrations 除外）不得出现 `UPDATE crm_notice_search`。
 *       宽表内容的唯一写入路径是 buildWideRow → upsertWideRows；对账只返回待重建 id。
 *       历史 5 段手写 UPDATE 与构建口径分叉，实测造成 8,367 行描述错值、列语义污染、
 *       精选人工摘要被覆盖。
 *   I2) 口径共用文件集内不得使用就地字面量：描述长度、描述来源表达式、合格机会谓词、
 *       译文 model 值。必须引用 lib/utils/notice-field-limits 与 notices/featured 的导出。
 *
 * 违规 exit 1，供 npm run lint 与 CI 拦截。
 * 扫描根可用环境变量 SSOT_SCAN_ROOT 覆盖（供本脚本自身的夹具测试使用）。
 */
const ROOT = process.env.SSOT_SCAN_ROOT || process.cwd();
const SCAN_DIRS = [path.join(ROOT, "src", "lib"), path.join(ROOT, "src", "features", "rfq")];
const EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);

/** I2 生效文件集：读宽表口径 / 写宽表内容 / 平台发布校验 */
const I2_SCOPE = [
  "src/lib/services/search-sync/",
  "src/lib/services/meilisearch/",
  "src/lib/services/search-orchestrator/detail-fetch.ts",
  "src/lib/services/translation/",
  "src/lib/repos/notices/",
  "src/features/rfq/",
];

const I2_RULES = [
  { re: /\.slice\(\s*0\s*,\s*(2000|300|500)\s*\)/, why: "描述/摘要长度必须引用 WIDE_LIMITS" },
  { re: /\bLEFT\(\s*[\w.]+\s*,\s*(2000|1000|500|300|200|100)\s*\)/i, why: "SQL 截断长度必须插值 WIDE_LIMITS" },
  { re: /COALESCE\(\s*(?:\w+\.)?description\s*,\s*(?:\w+\.)?description\s*\)/, why: "描述来源表达式必须引用 DESC_SOURCE_EXPR（D4 错值根因是两处各写一份）" },
  { re: /["']skip-same-lang["']/, why: "该 model 值全库无写入方（死分支），同语言直通请用 TRANSLATION_MODEL.SAME_LANG（D6）" },
  { re: /is_qualified\s*=\s*1\s+OR\s+(?:\w+\.)?status\s*=\s*1\s+OR\s+(?:\w+\.)?audit_status\s*=\s*1/, why: "合格机会谓词请用 utils/notice-qualified 的 qualifiedOppWhere" },
];

const violations = [];

function walk(target) {
  if (!fs.existsSync(target)) return;
  const st = fs.statSync(target);
  if (st.isDirectory()) {
    for (const item of fs.readdirSync(target)) walk(path.join(target, item));
    return;
  }
  if (!EXT.has(path.extname(target))) return;

  const rel = path.relative(ROOT, target).split(path.sep).join("/");
  // 一次性 schema 收敛迁移允许直接写宽表（历史包袱，不参与运行期口径）
  if (rel.startsWith("src/lib/db/migrations/")) return;

  const inI2Scope = I2_SCOPE.some((p) => rel.startsWith(p));
  const skipI2 = rel === "src/lib/utils/notice-field-limits.ts";

  fs.readFileSync(target, "utf8").split(/\r?\n/).forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    if (/UPDATE\s+crm_notice_search/i.test(line)) {
      violations.push(`I1 宽表单一写入者 → ${at}: ${line.trim()}`);
    }
    if (!inI2Scope || skipI2) return;
    for (const rule of I2_RULES) {
      if (rule.re.test(line)) violations.push(`I2 口径就地字面量 → ${at}: ${rule.why}\n     ${line.trim()}`);
    }
  });
}

for (const dir of SCAN_DIRS) walk(dir);

if (violations.length) {
  console.error("✖ 违反架构红线 #6（宽表单一写入者 / 口径单一事实源，详见 ARCHITECTURE.md）：");
  for (const v of violations) console.error(`  - ${v}`);
  console.error("  宽表内容由 buildWideRow 唯一写入；对账只返回待重建 id（syncWideIds）。");
  process.exit(1);
}
console.log("✓ 宽表单一写入者与口径单一事实源检查通过");
