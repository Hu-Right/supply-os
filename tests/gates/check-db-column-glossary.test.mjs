/**
 * 门禁自测：证明「列名对照表 + 后缀语义」红线真的会拦，而不是永远绿。
 * 口径与其余门禁一致：子进程跑真门禁，断言退出码 + 输出文本；fixture 走 DB_GLOSSARY_SCAN_ROOT。
 * 用法：node --test tests/gates/check-db-column-glossary.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runGate, withFixture } from "./lib/gate-runner.mjs";

const GATE = "check-db-column-glossary.mjs";
const ENV = (root) => ({ DB_GLOSSARY_SCAN_ROOT: root });
const run = (root) => runGate(GATE, ENV(root));

const TABLE = (cols) => [
  "CREATE TABLE `demo_t` (",
  "  `id` bigint NOT NULL AUTO_INCREMENT,",
  ...cols.map((c) => `  ${c},`),
  "  PRIMARY KEY (`id`)",
  ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;",
];

test("真实仓库应通过（存量别名与后缀债已冻结）", () => {
  const r = runGate(GATE);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /列名对照表红线通过/);
});

test("[BG1] 新表写 currency_code（与 currency 同义）必须被拦", () => {
  withFixture("glossary-alias", {
    "db/schema/baseline.sql": TABLE(["`currency_code` char(3) DEFAULT NULL"]),
  }, (root) => {
    const r = run(root);
    assert.equal(r.code, 1, "同义别名没被拦：\n" + r.out);
    assert.match(r.out, /\[GLOSSARY-ALIAS\]/);
    assert.match(r.out, /demo_t\.currency_code/);
    assert.match(r.out, /baseline\.sql:\d+/); // 必须给到「文件:行号」
  });
});

test("[BG1] ALTER TABLE ADD COLUMN 新增别名同样被拦（新增列的真实来路）", () => {
  withFixture("glossary-alter", {
    "src/lib/db/migrations/001.sql": [
      "ALTER TABLE `crm_bid_notices` ADD COLUMN `ccy` varchar(10) DEFAULT NULL;",
    ],
  }, (root) => {
    const r = run(root);
    assert.equal(r.code, 1, "ALTER 新增别名没被拦：\n" + r.out);
    assert.match(r.out, /\[GLOSSARY-ALIAS\]/);
    assert.match(r.out, /crm_bid_notices\.ccy/);
  });
});

test("[BG2] 后缀名实不符必须被拦（_ts 非整数、_at 非日期时间）", () => {
  withFixture("glossary-suffix", {
    "db/schema/baseline.sql": TABLE([
      "`published_ts` varchar(32) DEFAULT NULL",
      "`synced_at` int DEFAULT NULL",
    ]),
  }, (root) => {
    const r = run(root);
    assert.equal(r.code, 1, "后缀违规没被拦：\n" + r.out);
    assert.match(r.out, /\[SUFFIX-TYPE\]/);
    assert.match(r.out, /demo_t\.published_ts/);
    assert.match(r.out, /demo_t\.synced_at/);
  });
});

test("不误伤：canonical 名 + 后缀名实相符 + 已冻结存量，一律放行", () => {
  withFixture("glossary-ok", {
    "db/schema/baseline.sql": [
      ...TABLE(["`currency` varchar(10) NOT NULL DEFAULT 'CNY'", "`deadline_ts` bigint DEFAULT NULL",
        "`paid_at` datetime DEFAULT NULL", "`source_url` varchar(1024) DEFAULT NULL"]),
      "",
      // 冻结表里的真实存量：不应因新代码而报错
      "CREATE TABLE `crm_notice_public` (",
      "  `notice_pk` int NOT NULL,",
      "  `currency_code` char(3) DEFAULT NULL,",
      "  `updated_at` bigint DEFAULT NULL,",
      "  PRIMARY KEY (`notice_pk`)",
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;",
    ].join("\n"),
  }, (root) => {
    const r = run(root);
    assert.equal(r.code, 0, `合规写法被误伤：\n${r.out}`);
  });
});

test("生成列（deadline_sec 这类）按声明类型判定，不因 GENERATED 语法崩", () => {
  withFixture("glossary-generated", {
    "db/schema/baseline.sql": TABLE([
      "`deadline_sec` bigint unsigned GENERATED ALWAYS AS (`deadline_ts`) STORED",
    ]),
  }, (root) => {
    const r = run(root);
    assert.equal(r.code, 0, `生成列处理异常：\n${r.out}`);
  });
});

test("白名单卫生：冻结项不再命中时附「该删行」提示（机器兜住「忘了删」）", () => {
  // 冻结项 crm_notice_public.currency_code 在 fixture 里不存在 → 必须提示删行。
  // 注意走失败态断言：共享跑具只在非零退出时合并 stderr（卫生提示本身走 stderr，
  // 真实 npm run lint 终端里可见），成功态拿不到它。
  withFixture("glossary-stale", {
    "db/schema/baseline.sql": TABLE(["`currency_code` char(3) DEFAULT NULL"]),
  }, (root) => {
    const r = run(root);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /\[GLOSSARY-ALIAS\] \S*baseline\.sql:\d+: demo_t\.currency_code/); // 新别名照拦
    assert.match(r.out, /FROZEN_ALIASES [^"]*删除该行/);            // 已冻结项不再命中照提示
  });
});
