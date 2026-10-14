import fs from "node:fs";
import path from "node:path";

/**
 * 架构红线守卫：公告分类口径单一事实源 = 品目树（backbone_path；precise 口径已随 candidates 表退役）
 * @see docs/superpowers/specs/2026-10-12-notice-classification-commodity-tree-only-design.md
 *      （上述原文已不在仓内，口径与批次划分现由 …旧品类码-full-retirement-design.md 承接）
 *
 * 规则 NC1) 「读结果」链路（src/**，白名单目录除外）不得引用公告旧 旧品类字典分类列：
 *   - `(?:旧品类码|precise)_level[1-5]`：宽表公告分类列（`crm_notice_search`）
 *   - `precise_level[1-5]_id`：旧字典 precise 口径的 Meili 镜像属性
 *   公告分类只认 backbone_path（Meili 侧 backbone_node；precise_backbone_node 已随 candidates 表退役）。
 *   旧字典 ID 仅可作两类非分类用途：「内容变更指纹锚」（在 search-sync/，
 *   已列入白名单）与「外链/偏好输入键翻译层」（只搬运数字 id，不含上述 token，自然不命中）。
 *
 *   平台公告（桥表无行）的分类兜底也在翻译层：主表 category_l*_id → 旧字典 8 位码 → 同一份
 *   挂靠规则（D8）。它写在 search-sync/ 白名单内，但不拼任何 levelN 分类列。
 *
 *   注：裸 `level[1-5]_id` 不列为禁止项 —— 它与 `crm_user_industry_prefs`（用户五级行业偏好，
 *   R3 保留的输入键）同命名空间，宽列会误伤 70+ 处合法读用。公告 Meili `levelN_id` 属性由其
 *   源列 `旧品类码` 派生，禁住源头即可，无歧义 token 已覆盖真正的公告分类第二口径。
 *
 * 白名单 = 构建层，随退役逐目录收缩（B1 已将 meilisearch/sync.ts 与 client.ts 移出，
 * 索引层从此也受本门禁约束；DROP 旧列后连 search-sync/ 一起收缩，见 B2）：
 *   - src/lib/services/search-sync/  宽表构建（写列 + 指纹读桥表 levelN_id）
 *
 * 违规 exit 1，供 npm run lint 与 CI 拦截。扫描根可用 NOTICE_CLASSIFICATION_SCAN_ROOT 覆盖（夹具测试用）。
 */
const ROOT = process.env.NOTICE_CLASSIFICATION_SCAN_ROOT || process.cwd();
const SCAN_DIRS = [path.join(ROOT, "src")];
const EXT = new Set([".ts", ".tsx"]);

const ALLOWLIST = [
  // B1 已停写宽表旧列、已从 Meili 摘除旧属性 ⇒ 索引层不再是例外，只留构建层（B2 DROP 后一并收缩）
  "src/lib/services/search-sync/",
];

const FORBIDDEN = [
  { re: /\b(?:unspsc|precise)_level[1-5]\b/, why: "公告旧字典宽表列（分类第二口径）→ 用 backbone_path" },
  { re: /\bprecise_level[1-5]_id\b/, why: "公告旧字典 precise 镜像属性 → 用 backbone_node" },
];

/** 注释行不参与判定：文档与反例说明会引用旧 token 原文 */
function isCommentLine(line) {
  const t = line.trim();
  return t === "" || t.startsWith("//") || t.startsWith("///") || t.startsWith("/*") || t.startsWith("*");
}

const violations = [];
const files = [];
function walk(target) {
  if (!fs.existsSync(target)) return;
  const st = fs.statSync(target);
  if (st.isDirectory()) {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(path.join(target, entry.name));
    }
    return;
  }
  if (!EXT.has(path.extname(target))) return;
  files.push(target);
}

for (const dir of SCAN_DIRS) walk(dir);

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  if (ALLOWLIST.some((p) => rel.startsWith(p))) continue;
  fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
    if (isCommentLine(line)) return;
    for (const rule of FORBIDDEN) {
      if (rule.re.test(line)) {
        violations.push(`NC1 ${rule.why} → ${rel}:${i + 1}\n     ${line.trim()}`);
      }
    }
  });
}

if (violations.length) {
  console.error(`✗ 公告分类口径单一事实源（品目树）红线被违反（${violations.length} 处）：`);
  for (const v of violations.slice(0, 40)) console.error("  - " + v);
  console.error("修法：读结果链路一律走 backbone_path（Meili: backbone_node；precise 口径已随 candidates 表退役）；");
  console.error("      旧字典列仅限 search-sync 构建层（白名单），且 DROP 后连这一项也收缩。索引层已受本门禁约束。");
  process.exit(1);
}
console.log(`✓ 公告分类口径单一事实源（品目树）检查通过（扫描 ${files.length} 个文件，读结果链路无旧字典列引用）`);
