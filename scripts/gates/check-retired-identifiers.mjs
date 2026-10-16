/**
 * 退役标识符零残留门禁：代码（非注释）不得再出现已退役的 JS/TS 标识符。
 *
 * 背景：G 码退役把 IndustryScope 的 groupCode/groupNodes 改成 l1Code/l1Nodes，
 *   曾出现「生产改名、集成测试 mock 仍用旧字段」的漂移（行业墙 403 用例假失败，
 *   且因本地 pre-push 不跑集成测而只在 CI 才红）。本门禁把这类退役标识符钉成红线：
 *   任何新代码 / 新测试再引用即 exit 1。
 *
 * 与 check-legacy-dict-residue 的分工：
 *   · 那条扫旧采购字典（全库文本、含注释、尊重 .gitignore）；
 *   · 本条专扫「字段/函数改名类」退役标识符，且只看代码不看注释——退役说明注释
 *     （如「不再经 l1NodesOfGroup 翻译」）是合法历史记录，不该被自己拦下。
 *
 * 靶子标识符一律码位拼装：本文件与其自测都不出现连续明文（否则自身即残留）。
 * 新增退役标识符：改 RETIRED 表并走评审；确需保留的合法同名用法按行内注释说明。
 *
 * 用法：node scripts/gates/check-retired-identifiers.mjs（exit 0 = 干净 / 1 = 有残留）
 *       RETIRED_ID_REPO_ROOT=<path>  把扫描根换到指定仓库（自测 fixture 用；默认 cwd）
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 退役标识符：码位拼装，本文件文本层不出现连续明文
const RETIRED = [
  ["group", "Code"].join(""), // IndustryScope 旧字段（→ l1Code）
  ["group", "Nodes"].join(""), // IndustryScope 旧字段（→ l1Nodes）
  ["l1NodesOf", "Group"].join(""), // 旧翻译层函数（G 码退役后删除）
];
const RES = RETIRED.map((id) => new RegExp(`\\b${id}\\b`));

// 代码文件扩展名：只扫脚本，不扫 .sql/.md（结构快照与文档合法描述历史）
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;

const repoRoot = process.env.RETIRED_ID_REPO_ROOT || process.cwd();

// git 输出恒为正斜杠相对路径；尊重 .gitignore，历史留底/落刀备份不进射程
const tracked = execFileSync("git", ["-C", repoRoot, "ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const hits = [];
for (const rel of tracked) {
  if (!CODE_EXT.test(rel)) continue;
  let content;
  try {
    content = readFileSync(join(repoRoot, rel), "utf8");
  } catch {
    continue; // 空文件/删除竞态：跳过，不误判
  }
  content.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    // 整行注释跳过：// 行注释、/* 块起始、* 块内续行——退役说明注释属合法历史
    if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) return;
    for (let k = 0; k < RES.length; k++) {
      if (RES[k].test(line)) {
        hits.push(`${rel}:${i + 1}: [${RETIRED[k]}] ${t.slice(0, 90)}`);
        break;
      }
    }
  });
}

if (hits.length) {
  console.error(`✗ 退役标识符零残留门禁：${hits.length} 行代码命中（注释不计）：`);
  for (const h of hits.slice(0, 30)) console.error("  · " + h);
  if (hits.length > 30) console.error(`  · …另有 ${hits.length - 30} 行`);
  console.error("  修法：改用现行标识符（l1Code/l1Nodes）；确属合法同名用法请评审后加豁免。");
  process.exit(1);
}
console.log(
  `✓ 退役标识符零残留门禁通过（扫描 ${tracked.filter((f) => CODE_EXT.test(f)).length} 个 git 跟踪代码文件，注释不计；靶子 ${RETIRED.length} 个）`,
);
