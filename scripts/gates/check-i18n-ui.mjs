/**
 * i18n UI 硬编码中文门禁（AST 级）
 * Hardcoded-CJK gate for user-facing UI code
 *
 * @module scripts/gates/check-i18n-ui
 * @description 2026-11 审计发现：check-i18n.ts 只校验「7 语言键集一致」与「t("字面量") 有定义」，
 *              对「组件里直接写死中文」这一类零拦截 —— 于是 74 个 UI 文件把中文写进 JSX 文本
 *              与 title/label/placeholder/aria-label 等可见属性，切到 en/fr/ar 后整块不翻译。
 *              本门禁补上这一维：用 TypeScript 编译器 API 解析 src 下 UI 文件，凡是
 *              1) JSX 文本节点含 CJK，或
 *              2) 可见属性（title/label/placeholder/aria-label/...）字符串字面量含 CJK，或
 *              3) 对象字面量里同名可见属性键的值含 CJK
 *              都判为违规。
 *
 *              注释不参与判定（AST 不含注释），因此中文注释不受影响。
 *              合法例外（品牌名等）用同行 `i18n-allow: <理由>` 注释显式豁免，
 *              整文件例外（法律正文页等）用文件头 `i18n-allow-file: <理由>`。
 *
 *              两类不在此门禁口径内：
 *              - SEO metadata（`export const metadata` / `generateMetadata` 子树）：
 *                缺的是「按 locale 分路由」的架构，不是组件内翻译。
 *              - `.ts` 数据目录（如 src/data 的目录型数据）：属内容翻译欠债，另册记录。
 *
 *              扫描根可用 I18N_UI_SCAN_ROOT 覆盖（自测 fixture 用），默认仓库根。
 *              违规 exit 1，供 npm run check-i18n 与 pre-push 拦截。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** 默认扫描根 = 仓库根（本文件位于 scripts/gates/） */
const repoRoot = process.env.I18N_UI_SCAN_ROOT
  ? resolve(process.env.I18N_UI_SCAN_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** 只扫 UI 代码目录：页面、功能组件、共享组件 */
const UI_DIRS = ["src/app", "src/features", "src/shared"];

/** 可见文案属性名（JSX 属性与对象字面量键共用一套口径） */
const UI_ATTRS = new Set([
  "title",
  "label",
  "placeholder",
  "alt",
  "description",
  "desc",
  "hint",
  "hintText",
  "empty",
  "emptyText",
  "emptyTitle",
  "emptyDesc",
  "confirmText",
  "cancelText",
  "submitText",
  "okText",
  "tooltip",
  "subtitle",
  "header",
  "caption",
  "message",
  "text",
  "summary",
  "note",
  "tip",
  "tipText",
  "errorText",
  "loadingText",
  "buttonText",
  "helper",
  "aria-label",
  "ariaLabel",
  "aria-description",
  "aria-placeholder",
]);

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const ALLOW_MARK = "i18n-allow";
const ALLOW_FILE_MARK = "i18n-allow-file";

/** @param {string} dir @param {string[]} out */
function collectFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collectFiles(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const files = UI_DIRS.flatMap((d) => collectFiles(join(repoRoot, d)));
const violations = [];
let skippedFiles = 0;

for (const file of files.sort()) {
  const src = readFileSync(file, "utf8");
  if (!CJK.test(src)) continue;
  const lines = src.split(/\r?\n/);
  // 整文件豁免：文件头显式声明（理由写在同一行）
  if (lines.slice(0, 12).some((l) => l.includes(ALLOW_FILE_MARK))) {
    skippedFiles += 1;
    continue;
  }
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  const lineText = (pos) => lines[sf.getLineAndCharacterOfPosition(pos).line] ?? "";
  const reported = new Set();

  const report = (node, text, why, skipped) => {
    if (skipped) return;
    const start = node.getStart(sf);
    const line = sf.getLineAndCharacterOfPosition(start).line + 1;
    const key = `${line}:${why}`;
    if (reported.has(key)) return;
    // 同行 / 紧邻上一行显式豁免
    if (lineText(start).includes(ALLOW_MARK)) return;
    if ((lines[line - 2] ?? "").includes(ALLOW_MARK)) return;
    reported.add(key);
    violations.push({
      file: relative(repoRoot, file).replace(/\\/g, "/"),
      line,
      why,
      text: String(text).replace(/\s+/g, " ").trim().slice(0, 60),
    });
  };

  // SEO metadata 声明子树跳过：服务端按路由出语言，属另一层问题
  const isSeoMetadataDecl = (node) =>
    (ts.isVariableDeclaration(node) && node.name.getText(sf) === "metadata") ||
    (ts.isFunctionDeclaration(node) && node.name?.getText(sf) === "generateMetadata");

  const visit = (node, skipped = false) => {
    const skip = skipped || isSeoMetadataDecl(node);
    if (ts.isJsxText(node)) {
      if (CJK.test(node.text)) report(node, node.text, "jsx-text", skip);
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf);
      if (UI_ATTRS.has(name)) {
        const init = node.initializer;
        if (init && ts.isStringLiteral(init) && CJK.test(init.text)) {
          report(init, init.text, `attr:${name}`, skip);
        } else if (
          init &&
          ts.isJsxExpression(init) &&
          init.expression &&
          ts.isStringLiteral(init.expression) &&
          CJK.test(init.expression.text)
        ) {
          report(init.expression, init.expression.text, `attr:${name}`, skip);
        }
      }
    } else if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(sf).replace(/^["']|["']$/g, "");
      if (UI_ATTRS.has(name)) {
        const init = node.initializer;
        if (
          (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) &&
          CJK.test(init.text)
        ) {
          report(init, init.text, `prop:${name}`, skip);
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, skip));
  };
  visit(sf);
}

if (violations.length) {
  console.error(
    `\u274c i18n UI 硬编码中文：${violations.length} 处（${new Set(violations.map((v) => v.file)).size} 个文件）—— 请改用 t("key")；合法例外加同行 // ${ALLOW_MARK}: <理由>，整文件例外加 // ${ALLOW_FILE_MARK}: <理由>`,
  );
  for (const v of violations) {
    console.error(`   - ${v.file}:${v.line}  [${v.why}]  ${v.text}`);
  }
  process.exit(1);
}

console.log(
  `\u2705 i18n UI 文案无硬编码中文（扫描 ${files.length} 个 .tsx，覆盖 ${UI_DIRS.join(" / ")}${skippedFiles ? `，${skippedFiles} 个文件显式豁免` : ""}）`,
);
