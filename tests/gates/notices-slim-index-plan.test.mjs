/**
 * 不变量自测：删列批次必须把「建在该列上的索引」显式登记处置
 *
 * 守的是什么：阶段一 A3 闸只在跑脚本时才生效，而它一旦靠人记得填 BATCH_INDEX_PLAN 才算有用，
 * 就等于没有——将来有人把某个挂在索引上的列加进某批次，或把已登记的索引名改了，A3 要到
 * 落刀当天才炸。这条测试把它提前到测试/CI：判据直接读 db/schema/baseline.sql 的本表块，
 * 与 notices-slim-plan.mjs 的批次列集、索引登记表对账。
 *
 * 两条防自骗的设计（都是本轮真踩过的坑形）：
 *   ① 判定核心是纯函数 planProblems() / landedProblems()，另有**反例用例**（把批次二的登记清空、
 *      或把已退役的索引塞回基线），断言它必须报错且报出索引名 —— 否则「全绿」只说明断言在空转。
 *   ② 判据随生命周期换：批次落库后那些索引名本身会从基线消失，若还按落库前口径断言就会
 *      假失败；那时该守的是「退役的真没了、登记重建的形状对得上」。落库前的形状因此
 *      以 PRECUT_BATCH2 常量留在本文件里给反例用（基线自己已经不再含那个形状）。
 *
 * 用法：node --test tests/gates/notices-slim-index-plan.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { BATCHES, indexPlanOf, baselineNoticeColumns, NOTICES_TABLE } from "../../scripts/tools/notices-slim-plan.mjs";

const ROOT = path.join(import.meta.dirname, "..", "..");
const BASELINE = fs.readFileSync(path.join(ROOT, "db/schema/baseline.sql"), "utf8");

/** 从 baseline 的本表块里抽出「索引名 → 裸列序列」（前缀长度 `(100)` 剖掉） */
function indexesFromBaseline() {
  const start = BASELINE.indexOf(`CREATE TABLE \`${NOTICES_TABLE}\` (`);
  assert.ok(start >= 0, `baseline 里找不到 ${NOTICES_TABLE}`);
  const block = BASELINE.slice(start, BASELINE.indexOf("\n) ENGINE=", start));
  const bare = (s) => s.split(",").map((x) => x.trim().replace(/^`|`$/g, "").replace(/\(\d+\)$/, ""));
  const map = new Map();
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim().replace(/,$/, "");
    // PRIMARY KEY 没有名字段，混在同一个通用正则里会被整体漏掉（实测踩过）
    const pk = line.match(/^PRIMARY\s+KEY\s*\(([^)]*)\)/i);
    if (pk) {
      map.set("PRIMARY", bare(pk[1]));
      continue;
    }
    const k = line.match(/^(?:UNIQUE\s+|FULLTEXT\s+)?KEY\s+`(\w+)`\s*\(([^)]*)\)/i);
    if (!k) continue;
    map.set(k[1], bare(k[2]));
  }
  return map;
}

const IDX = indexesFromBaseline();
const COLS = new Set(baselineNoticeColumns(BASELINE));

/**
 * 批次二**落库前**的真实形状（从 528742b1 归档的 baseline 逐字摘出，另加 PK 与 idx_create_time）。
 * 为什么要在测试里自带一份：is_converted 落库后，基线里已经没有任何索引建在它上面，
 * 「清空登记必须报错」这条反例若还去读基线，前置条件就恒不成立 —— 反例会在落库当天
 * 静默退化成空转，而空转的绿色比红色危险。
 */
const PRECUT_BATCH2_IDX = new Map([
  ["PRIMARY", ["id"]],
  ["idx_bid_notices_converted_create_id", ["is_converted", "create_time", "id"]],
  ["idx_bid_notices_converted_opp", ["is_converted", "converted_opp_id"]],
  ["idx_create_time", ["create_time"]],
]);
const PRECUT_BATCH2_COLS = new Set(["id", "is_converted", "converted_opp_id", "create_time"]);

/** 该批次的列是否已全部不在基线里（= 已落库） */
const landed = (cols) => cols.length > 0 && cols.every((c) => !COLS.has(c));

/**
 * 核心判定（纯函数，正反用例共用）：给定「结构现场 + 待删列集 + 索引处置计划」，返回违规说明。
 * 结构现场作参数而非读模块常量：同一份判据既能对现基线跑，也能对落库前形状跑（反例用）。
 * @param {{idx: Map<string,string[]>, cols: Set<string>, columns: string[], plan: {drop: string[], add: {name:string,cols:string[]}[]}}} p
 */
function planProblems({ idx, cols, columns, plan }) {
  const problems = [];
  // 建在待删列上的索引（id 除外：主键列本就不允许进删列清单）
  const onDrop = [...idx.entries()]
    .filter(([, cs]) => cs.some((c) => columns.includes(c) && c !== "id"))
    .map(([n]) => n);
  for (const n of onDrop) {
    if (!plan.drop.includes(n)) problems.push(`索引 ${n} 建在待删列上却未登记 DROP`);
  }
  for (const n of plan.drop) {
    if (!idx.has(n)) problems.push(`登记要 DROP 的 ${n} 在基线里不存在`);
  }
  for (const a of plan.add) {
    if (idx.has(a.name) && !plan.drop.includes(a.name)) problems.push(`同名重建 ${a.name} 却未先登记 DROP`);
    for (const c of a.cols) {
      if (columns.includes(c)) problems.push(`ADD 的 ${a.name} 又把待删列 ${c} 放了回去`);
      if (!cols.has(c)) problems.push(`ADD 的 ${a.name} 引用了基线里不存在的列 ${c}`);
    }
  }
  return { problems, onDrop };
}

/**
 * 落库后的判据（与落库前互为反向，这是生命周期换来的）：
 *   · 纯退役项（在 drop 里、不在 add 里）必须已从基线消失 —— 还在场就是刀没落；
 *   · 登记重建项必须按登记的列集在场 —— 名字对而列集错是另一种查询能力，不能只看名字。
 * 注意这里**不再**把「drop 登记的名字不在基线里」当违规：那正是退役成功的样子，
 * 而登记表要留在原处作为「当初为什么这么处置」的凭证（同 PARALLEL_DROPPED_COLUMNS 进门禁的口径）。
 * @param {{idx: Map<string,string[]>}} p
 */
function landedProblems({ idx, plan }) {
  const problems = [];
  for (const n of plan.drop) {
    if (plan.add.some((a) => a.name === n)) continue;
    if (idx.has(n)) problems.push(`${n} 本批应已退役，但基线里仍在场`);
  }
  for (const a of plan.add) {
    const got = idx.get(a.name);
    if (!got) problems.push(`登记重建的 ${a.name} 在基线里不存在`);
    else if (JSON.stringify(got) !== JSON.stringify(a.cols)) {
      problems.push(`${a.name} 列集不符：期望 (${a.cols.join(",")}) 实得 (${got.join(",")})`);
    }
  }
  return problems;
}

test("基线解析本身可信：列数、主键与 FULLTEXT 都抽到了", () => {
  assert.ok(COLS.size >= 40, `本表列数解析异常：${COLS.size}`);
  // 批次二把等价冗余的 idx_bid_notices_converted_create_id 退役后，现场是 16 个索引
  assert.ok(IDX.size >= 15, `索引数解析异常：${IDX.size}（现网 16 个）`);
  assert.deepEqual(IDX.get("PRIMARY"), ["id"], `主键解析不对：${IDX.get("PRIMARY")}`);
  const ft = [...IDX.entries()].filter(([, c]) => c.includes("description") || c.includes("title")).map(([n]) => n);
  assert.ok(ft.length >= 3, `FULLTEXT 没抽到：${ft.join(",")}`);
});

test("反例（证明本闸会拦）：按落库前形状把批次二的登记清空，必须报错且报出那两个索引", () => {
  const { problems, onDrop } = planProblems({
    idx: PRECUT_BATCH2_IDX,
    cols: PRECUT_BATCH2_COLS,
    columns: BATCHES[2].columns,
    plan: { drop: [], add: [] },
  });
  assert.ok(onDrop.length >= 2, `前置失效：落库前形状里 is_converted 竟没命中 ≥2 个索引，实得 ${onDrop.join(",")}`);
  assert.ok(problems.length >= 2, "登记被清空却没有报错 —— 这条测试在空转");
  for (const n of ["idx_bid_notices_converted_create_id", "idx_bid_notices_converted_opp"]) {
    assert.ok(problems.some((p) => p.includes(n)), `反例报错里没点名 ${n}：${problems.join(" / ")}`);
  }
});

test("反例（证明落库判据会拦）：把已退役的索引塞回基线，必须报错", () => {
  const fake = new Map(IDX);
  fake.set("idx_bid_notices_converted_create_id", ["is_converted", "create_time", "id"]);
  const problems = landedProblems({ idx: fake, plan: indexPlanOf(2) });
  assert.ok(
    problems.some((p) => p.includes("idx_bid_notices_converted_create_id")),
    "退役项仍在场却没报错 —— 这条落库判据在空转",
  );
  const wrongShape = new Map(IDX);
  wrongShape.set("idx_bid_notices_converted_opp", ["converted_opp_id", "create_time"]);
  assert.ok(
    landedProblems({ idx: wrongShape, plan: indexPlanOf(2) }).some((p) => p.includes("idx_bid_notices_converted_opp 列集不符")),
    "重建索引列集错了却没报错 —— 只看名字的判据等于没判",
  );
});

test("未落库批次：登记必须齐全，且登记表与基线不得漂", () => {
  const all = [];
  for (const [b, v] of Object.entries(BATCHES)) {
    if (landed(v.columns)) continue;
    for (const p of planProblems({ idx: IDX, cols: COLS, columns: v.columns, plan: indexPlanOf(Number(b)) }).problems) {
      all.push(`批次 ${b}：${p}`);
    }
  }
  assert.deepEqual(all, [], all.join("\n"));
});

test("批次二的意图：converted_opp_id 有索引支撑，等价冗余的那个显式退役", () => {
  const plan = indexPlanOf(2);
  const before = PRECUT_BATCH2_IDX.get("idx_bid_notices_converted_opp") ?? [];
  assert.ok(before.includes("converted_opp_id"), `落库前该索引本应含 converted_opp_id，实得 ${before.join(",")}`);
  const after = plan.add.find((a) => a.name === "idx_bid_notices_converted_opp");
  assert.ok(after, "必须同名重建 idx_bid_notices_converted_opp，否则 converted_opp_id 失去索引支撑");
  assert.deepEqual(after.cols, ["converted_opp_id"], "重建定义应只剩 converted_opp_id 一列");
  // 另一个 (is_converted, create_time, id) 退役后只剩 (create_time, id)，而 InnoDB 二级索引
  // 本来隐含主键 ⇒ 与既有 idx_create_time 等价冗余，不得重建
  assert.ok(plan.drop.includes("idx_bid_notices_converted_create_id"), "该索引必须显式退役");
  assert.ok(!plan.add.some((a) => a.name === "idx_bid_notices_converted_create_id"), "冗余索引不应被重建");
  assert.deepEqual(IDX.get("idx_create_time"), ["create_time"], "前提：基线里得真有 idx_create_time，否则上面的冗余判定不成立");
});

test("已落库批次：退役的必须真没了，登记重建的必须按登记形状在场", () => {
  const problems = [];
  for (const [b, v] of Object.entries(BATCHES)) {
    if (!landed(v.columns)) continue;
    for (const p of landedProblems({ idx: IDX, plan: indexPlanOf(Number(b)) })) problems.push(`批次 ${b}：${p}`);
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});
