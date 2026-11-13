/**
 * 退役订单表零读写门禁：payment_orders / learning_orders / training_orders 三张旧订单表
 * 已统一收敛至 `orders`（008 建表 → 回填 → 切读写，009 硬化定稿），本门禁把「无读方」
 * 从人工判断变成机器值守——门禁绿，三表即死，DROP 随时可在人工确认后执行（ADR-0019）。
 *
 * 背景：008/009 把四张分散订单表收敛为统一订单头 `orders`，三旧表停写停读，
 *   仅作回滚与外部系统兼容保留。若不驻守，「顺手查一下旧表」的口子随时会重新打开，
 *   三张僵尸表将无限期滞留（与退役前的旧采购字典、G 码同一类风险）。
 *
 * 口径：
 *   · 只拦**代码**（整行注释不计）——退役说明注释是合法历史记录；
 *   · `src/lib/db/migrations/**` 豁免——历史 DDL（008/009）与将来的一次性 DROP 迁移
 *     是三表唯一的合法代码出口；
 *   · `service_orders` **不在**本门禁射程——它未退役，仍承载线下成交台账（009 定稿：
 *     线下 lead/contract 不进 orders）；
 *   · .sql/.md 不扫：结构快照与文档合法描述历史。
 *
 * 靶子表名一律码位拼装：本文件与其自测都不出现连续明文（否则自身即残留）。
 *
 * 用法：node scripts/gates/check-legacy-order-tables.mjs（exit 0 = 干净 / 1 = 有读写残留）
 *       LEGACY_ORDER_REPO_ROOT=<path>  把扫描根换到指定仓库（自测 fixture 用；默认 cwd）
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 退役表名：码位拼装，本文件文本层不出现连续明文
const RETIRED = [
  ["payment", "_orders"].join(""), // 会员单（→ orders product_kind='plan'）
  ["learning", "_orders"].join(""), // 学习单（→ orders product_kind='material'/'bundle'）
  ["training", "_orders"].join(""), // 培训单（→ orders product_kind='course'）
];
const RES = RETIRED.map((t) => new RegExp(`\\b${t}\\b`));

// 唯一豁免目录：迁移（历史 DDL 与将来的一次性 DROP 出口）
const EXEMPT_PREFIX = "src/lib/db/migrations/";

// 代码文件扩展名：不扫 .sql/.md（结构快照与文档合法描述历史）
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;

const repoRoot = process.env.LEGACY_ORDER_REPO_ROOT || process.cwd();

// git 输出恒为正斜杠相对路径；尊重 .gitignore（scripts/ops 一次性脚本不入射程）
const tracked = execFileSync("git", ["-C", repoRoot, "ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const hits = [];
for (const rel of tracked) {
  if (!CODE_EXT.test(rel)) continue;
  if (rel.replaceAll("\\", "/").startsWith(EXEMPT_PREFIX)) continue;
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
    for (const re of RES) {
      if (re.test(line)) {
        hits.push(`${rel}:${i + 1}: ${t.slice(0, 90)}`);
        break;
      }
    }
  });
}

if (hits.length) {
  console.error(`✗ 退役订单表零读写门禁：${hits.length} 行代码命中（注释不计）：`);
  for (const h of hits.slice(0, 30)) console.error("  · " + h);
  if (hits.length > 30) console.error(`  · …另有 ${hits.length} 行`);
  console.error(
    "  修法：读写一律走统一订单表 orders（008/009 定稿，ADR-0019）；\n" +
    "        service_orders（线下台账）不受本门禁限制；\n" +
    "        src/lib/db/migrations/ 下的一次性 DROP 迁移豁免。",
  );
  process.exit(1);
}
console.log(
  `✓ 退役订单表零读写门禁通过（扫描 ${tracked.filter((f) => CODE_EXT.test(f)).length} 个 git 跟踪代码文件，注释不计；靶子 ${RETIRED.length} 张表）`,
);
