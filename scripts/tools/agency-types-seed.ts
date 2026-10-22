/**
 * 机构类型字典/规则初始化：把代码里的 TYPE_PATTERNS 一次性灌入数据库。
 * 之后 classifyAgencyType 优先读表，规则改动不再需要发版。
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { INTL_TYPE_PATTERNS, TYPE_PATTERNS } from "../../src/lib/data/agency-i18n/type-patterns";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const c = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
});

await c.query(
  `CREATE TABLE IF NOT EXISTS crm_agency_types (
     type_key VARCHAR(100) NOT NULL,
     country_code CHAR(2) NULL,
     name_i18n JSON NULL,
     priority INT NOT NULL DEFAULT 0,
     is_active TINYINT(1) NOT NULL DEFAULT 1,
     PRIMARY KEY (type_key),
     KEY idx_agency_types_country (country_code)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
);
await c.query(
  `CREATE TABLE IF NOT EXISTS crm_agency_type_rules (
     id INT UNSIGNED NOT NULL AUTO_INCREMENT,
     type_key VARCHAR(100) NOT NULL,
     country_code CHAR(2) NULL,
     pattern VARCHAR(1000) NOT NULL,
     flags VARCHAR(10) NOT NULL DEFAULT 'i',
     priority INT NOT NULL DEFAULT 0,
     is_active TINYINT(1) NOT NULL DEFAULT 1,
     PRIMARY KEY (id),
     KEY idx_rules_type (type_key),
     KEY idx_rules_country_priority (country_code, priority),
     CONSTRAINT fk_agency_rule_type FOREIGN KEY (type_key) REFERENCES crm_agency_types (type_key)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
);

const countryOf = (typeKey: string): string | null =>
  typeKey.endsWith("_BR") ? "BR" : typeKey.endsWith("_KE") ? "KE" : null;

const types = new Map<string, { country: string | null; i18n: Record<string, string>; priority: number }>();
for (const [regex, info] of TYPE_PATTERNS) {
  if (!types.has(info.typeKey)) {
    types.set(info.typeKey, { country: countryOf(info.typeKey), i18n: info.i18n, priority: types.size });
  }
  void regex;
}
for (const [regex, info] of INTL_TYPE_PATTERNS) {
  const country = countryOf(info.typeKey);
  if (!types.has(info.typeKey)) {
    types.set(info.typeKey, { country, i18n: info.i18n, priority: types.size });
  }
  void regex;
}

await c.query(`DELETE FROM crm_agency_type_rules`);
for (const [typeKey, t] of types) {
  await c.query(
    `INSERT INTO crm_agency_types (type_key, country_code, name_i18n, priority, is_active)
     VALUES (?,?,?,?,1)
     ON DUPLICATE KEY UPDATE country_code=VALUES(country_code), name_i18n=VALUES(name_i18n),
       priority=VALUES(priority), is_active=1`,
    [typeKey, t.country, JSON.stringify(t.i18n), t.priority],
  );
}

let priority = 0;
for (const [regex, info] of TYPE_PATTERNS) {
  await c.query(
    `INSERT INTO crm_agency_type_rules (type_key, country_code, pattern, flags, priority, is_active)
     VALUES (?,?,?,?,?,1)`,
    [info.typeKey, countryOf(info.typeKey), regex.source, regex.flags, priority++],
  );
}
for (const [regex, info] of INTL_TYPE_PATTERNS) {
  await c.query(
    `INSERT INTO crm_agency_type_rules (type_key, country_code, pattern, flags, priority, is_active)
     VALUES (?,?,?,?,?,1)`,
    [info.typeKey, countryOf(info.typeKey), regex.source, regex.flags, priority++],
  );
}

const [counts] = await c.query(
  `SELECT (SELECT COUNT(*) FROM crm_agency_types) types, (SELECT COUNT(*) FROM crm_agency_type_rules) rules`,
);
console.log((counts as Array<Record<string, unknown>>)[0]);
await c.end();
