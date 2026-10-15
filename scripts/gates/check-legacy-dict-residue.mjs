/**
 * 旧字典零残留门禁：全部 git 跟踪文本文件不得再出现旧采购分类标准字样（大小写不敏感）。
 *
 * 背景：旧品目字典退役（§7~§12.3 + R2/R3 批次）完成后，防止旧字样从任何入口回潜——
 *   新代码、新注释、新测试、新文档、新基线都过这一道。
 *
 * 射程 = `git ls-files` 列出的跟踪文本文件：天然尊重 .gitignore，故 scripts/ops、runtime、
 *   temp 里的历史留底/落刀备份**不在射程**（它们含旧字样属取证，不为「搜索干净」而改写）。
 *   按扩展名白名单过滤，二进制/办公件自动挡在门外。
 *
 * 豁免口径（收紧后的唯一硬口径，代码评审-controlled）：仅结构基线里由外部爬虫侧拥有、
 *   本仓零读写的 supplier 两列 DDL 定义行。已删除以下绕过面：
 *     · not.to… 负向守卫整行放行（测试要断言「不含旧字样」应码位拼装靶子，不靠豁免）
 *     · why: 说明行整行放行
 *     · 非 baseline 文件的裸列名全局放行
 *     · .env 追加任意子串豁免
 *   新增合法外部列：改本文件 EXEMPT 表并走评审，不开环境变量后门。
 *
 * 靶子字样不在本文件写明（否则门禁自身就是残留）：一律码位拼装。
 *
 * 用法：node scripts/gates/check-legacy-dict-residue.mjs（exit 0 = 干净 / 1 = 有残留）
 *       LEGACY_DICT_REPO_ROOT=<path>  把扫描根换到指定仓库（自测 fixture 用；默认 cwd）
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 门禁靶子：码位拼装，本仓文本层不出现连续旧字样
const LEGACY = ["un", "sp", "sc"].join("");
const RE = new RegExp(LEGACY, "i");

// 文本扩展名白名单：与 gitignore 双保险，二进制/图片/办公件不进射程
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|markdown|sql|css|scss|html|ya?ml|txt)$/i;

// 精确豁免：仅 baseline 结构快照里、由外部爬虫侧拥有且本仓零读写的 supplier 两列 DDL 行。
// 匹配「trim 后以该列反引号名开头」——不放行整文件，旧五级列等混进基线仍会被拦。
const BASELINE = "db/schema/baseline.sql";
const EXEMPT = {
  [BASELINE]: [
    new RegExp("^`" + LEGACY + "_codes_snapshot`"),
    new RegExp("^`" + LEGACY + "_match_status`"),
  ],
};

const repoRoot = process.env.LEGACY_DICT_REPO_ROOT || process.cwd();

// git 输出的路径恒为正斜杠相对路径；EXEMPT 的 key 与命中展示都用它
const tracked = execFileSync("git", ["-C", repoRoot, "ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const hits = [];
for (const rel of tracked) {
  if (!TEXT_EXT.test(rel)) continue;
  let content;
  try {
    content = readFileSync(join(repoRoot, rel), "utf8");
  } catch {
    continue; // 空文件/删除竞态：跳过，不误判
  }
  const exempt = EXEMPT[rel];
  content.split(/\r?\n/).forEach((line, i) => {
    if (!RE.test(line)) return;
    if (exempt && exempt.some((re) => re.test(line.trim()))) return;
    hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
  });
}

if (hits.length) {
  console.error(`✗ 旧字典零残留门禁：${hits.length} 行命中（豁免仅精确到 ${BASELINE} 的 2 列外部快照）：`);
  for (const h of hits.slice(0, 30)) console.error("  · " + h);
  if (hits.length > 30) console.error(`  · …另有 ${hits.length - 30} 行`);
  process.exit(1);
}
console.log(
  `✓ 旧字典零残留门禁通过（扫描 ${tracked.filter((f) => TEXT_EXT.test(f)).length} 个 git 跟踪文本文件，尊重 .gitignore；豁免仅 baseline 两列外部快照）`,
);
