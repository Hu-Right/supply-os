import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const c = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME || "crm", charset: "utf8mb4" });

const types: Array<[string, string, string]> = [
  ["SPACE_INTL", "各航天机构", "Space agencies"],
  ["POSTAL_INTL", "各邮政机构", "Postal services"],
  ["PUBLIC_ENTERPRISE_INTL", "各公共企业", "Public enterprises"],
  ["DEVELOPMENT_AGENCY_INTL", "各发展合作机构", "Development agencies"],
];
for (const [key, zh, en] of types) {
  await c.query(
    `INSERT INTO agency_types (type_key,country_code,name_i18n,priority,is_active)
     VALUES (?,NULL,?,0,1) ON DUPLICATE KEY UPDATE name_i18n=VALUES(name_i18n)`,
    [key, JSON.stringify({ zh, en })],
  );
}

const rows: Array<[string, string]> = [
  ["NATIONAL AERONAUTICS AND SPACE ADMINISTRATION", "SPACE_INTL"],
  ["GENERAL SERVICES ADMINISTRATION", "PUBLIC_ADMIN_INTL"],
  ["POSTAL SERVICE", "POSTAL_INTL"],
  ["ARCHITECT OF THE CAPITOL", "PUBLIC_ADMIN_INTL"],
  ["SELECTIVE SERVICE SYSTEM", "DEFENSE_INTL"],
  ["CENTERS FOR DISEASE CONTROL AND PREVENTION (HQ)", "HEALTH_INTL"],
  ["NHS ENGLAND", "HEALTH_INTL"],
  ["NATURAL ENGLAND", "PUBLIC_ADMIN_INTL"],
  ["KRAJOWA IZBA ODWOŁAWCZA", "TRIBUNAL_INTL"],
  ["POLSKA GRUPA GÓRNICZA S.A.", "ENERGY_INTL"],
  ["DB INFRAGO AG – GESCHÄFTSBEREICH FAHRWEG (BUKR 16)", "RAILWAY_INTL"],
  ["DEUTSCHE GESELLSCHAFT FÜR INTERNATIONALE ZUSAMMENARBEIT (GIZ) GMBH", "DEVELOPMENT_AGENCY_INTL"],
  ["EMPRESA DE TRANSFORMACIÓN AGRARIA S.A.,S.M.E., M.P., (TRAGSA)", "PUBLIC_ENTERPRISE_INTL"],
  ["ÓRGANO ADMINISTRATIVO DE RECURSOS CONTRACTUALES", "TRIBUNAL_INTL"],
  ["CRNOGORSKI ELEKTROPRENOSNI SISTEM AD PODGORICA", "ENERGY_INTL"],
  ["CRNOGORSKI ELEKTRODISTRIBUTIVNI SISTEM DOO", "ENERGY_INTL"],
  ["EBSERH", "HOSPITAL_INTL"],
  ["EMBRAPA", "INSTITUTE_INTL"],
  ["UNESP", "UNIVERSITY_INTL"],
  ["UNICAMP", "UNIVERSITY_INTL"],
  ["UDESC", "UNIVERSITY_INTL"],
  ["FIOTEC", "FOUNDATION_INTL"],
  ["IMBEL", "DEFENSE_INTL"],
  ["CAIXA", "BANK_INTL"],
  ["ÚRAD PRE VEREJNÉ OBSTARÁVANIE", "REGULATORY_INTL"],
  ["THE MONTEVIDEO INTENDENCE", "MUNICIPALITY_INTL"],
  ["BANGKOK", "MUNICIPALITY_INTL"],
  ["GRAD ZAGREB", "MUNICIPALITY_INTL"],
  ["GEMEENTE ROTTERDAM", "MUNICIPALITY_INTL"],
  ["PUBLIC WORKS", "PUBLIC_WORKS_INTL"],
  ["SERVICIO DE SALUD DE LAS ILLES BALEARS", "HEALTH_INTL"],
  ["PKP POLSKIE LINIE KOLEJOWE S.A.", "RAILWAY_INTL"],
  ["MINISTERIE VAN DEFENSIE", "MINISTRY_INTL"],
  ["KOMENDA GŁÓWNA POLICJI", "POLICE_INTL"],
  ["UPRAVA ZA IZVRŠENJE KRIVIČNIH SANKCIJA", "PUBLIC_ADMIN_INTL"],
];
for (const [canonical, typeKey] of rows) {
  await c.query(
    `INSERT INTO agency_type_assignments (canonical,country_code,type_key,is_active)
     VALUES (?,NULL,?,1) ON DUPLICATE KEY UPDATE type_key=VALUES(type_key), is_active=1`,
    [canonical, typeKey],
  );
}
const [a] = await c.query(`SELECT COUNT(*) n FROM agency_type_assignments`);
const [t] = await c.query(`SELECT COUNT(*) n FROM agency_types`);
console.log({ assignments: (a as Array<Record<string, unknown>>)[0], types: (t as Array<Record<string, unknown>>)[0] });
await c.end();
