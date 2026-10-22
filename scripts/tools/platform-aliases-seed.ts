import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const c = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME || "crm", charset: "utf8mb4" });

const platforms: Array<[string, string, string]> = [
  ["eprocure.gov.in", "CPPP", "cppp"],
  ["boamp.fr", "BOAMP", "boamp"],
  ["tenders.procurement.gov.ge", "Georgian e-Procurement", "ge-eprocurement"],
  ["prozorro.gov.ua", "Prozorro", "prozorro"],
  ["community.secop.gov.co", "SECOP II", "secop2"],
  ["zakupki.gov.kg", "Kyrgyz e-Procurement", "kg-eprocurement"],
  ["epads.gov.pk", "EPADS", "epads"],
  ["tender.gov.mn", "Mongolia e-Procurement", "mn-eprocurement"],
  ["egp.gov.et", "Ethiopian e-Procurement", "et-eprocurement"],
  ["epms.ppra.gov.pk", "EPMS Punjab", "epms-punjab"],
  ["zakupki.okmot.kg", "OKMOT", "okmot"],
  ["comprasestatales.gub.uy", "Compras Estatales", "compras-estatales-uy"],
  ["contrataciondelestado.es", "Plataforma de Contratación del Sector Público", "plataforma-contratacion-es"],
  ["base.gov.pt", "BASE.gov.pt", "base-pt"],
  ["goszakup.gov.kz", "Goszakup", "goszakup"],
  ["eprocurement.gov.tj", "Tajikistan e-Procurement", "tj-eprocurement"],
  ["evergabe-online.de", "eVergabe", "evergabe"],
  ["tenders.go.ke", "Kenya PPIP", "ke-ppip"],
  ["eprocurement.gov.cy", "Cyprus e-Procurement", "cy-eprocurement"],
  ["tenders.ge", "tenders.ge", "tenders-ge"],
  ["marchespublics.gov.tn", "Tunisie Marchés Publics", "tn-marches-publics"],
  ["etenders.gov.ie", "eTenders Ireland", "etenders-ie"],
  ["joneps.gov.jo", "JONEPS", "joneps"],
  ["uvo.gov.sk", "UVO", "uvo-sk"],
  ["afdb.org", "AfDB", "afdb"],
  ["ekapv2.kik.gov.tr", "EKAP", "ekap"],
  ["mr.gov.il", "Israel Government Procurement", "mr-il"],
  ["etender.uzex.uz", "UZEX", "uzex"],
  ["comunidad.comprasdominicana.gob.do", "Compras Dominicanas", "compras-do"],
  ["ghaneps.gov.gh", "GHANEPS", "ghaneps"],
  ["giz.de", "GIZ", "giz"],
  ["eprocurement.gov.gr", "Greek e-Procurement", "gr-eprocurement"],
  ["compraspublicas.gob.ec", "Compras Públicas Ecuador", "compras-ec"],
  ["ppa.gov.lb", "PPA Lebanon", "ppa-lb"],
  ["dmo.gov.tr", "DMO", "dmo-tr"],
  ["openprocurement.al", "Open Procurement Albania", "openprocurement-al"],
  ["eprocure.zppa.org.zm", "ZPPA e-Procurement", "zppa"],
  ["nea.org.np", "NEA Nepal", "nea-np"],
  ["itp.iq", "ITP Iraq", "itp-iq"],
  ["isdb.org", "IsDB", "isdb"],
  ["nabavke.mod.gov.rs", "Serbian Ministry of Defence Procurement", "mod-rs"],
  ["tenders.gov.au", "AusTender", "austender"],
  ["rhd.portal.gov.bd", "RHD Bangladesh", "rhd-bd"],
  ["tenders.tj", "Tajikistan Tenders", "tenders-tj"],
  ["au.int", "African Union", "au-int"],
  ["ashghal.gov.qa", "Ashghal Qatar", "ashghal"],
  ["ezak.cz", "EZAK", "ezak-cz"],
  ["sadc.int", "SADC", "sadc"],
  ["ppcc.gov.lr", "PPCC Liberia", "ppcc-lr"],
  ["SAM.gov", "System for Award Management", "sam"],
  ["BASE.gov.pt", "BASE", "base-pt"],
  ["turkmennebit.gov.tm", "Türkmennebit", "turkmennebit"],
  ["salesforce-sites.com", "Salesforce", "salesforce"],
  ["turkmengaz.gov.tm", "Türkmengaz", "turkmengaz"],
  ["xt-xarid.uz", "XT Xarid", "xt-xarid"],
  ["oraclecloud.com", "Oracle Cloud", "oracle-cloud"],
  ["ausschreibungen.kfw.de", "KfW", "kfw"],
  ["ppdaa.gov.ss", "PPDA South Sudan", "ppdaa-ss"],
  ["mintrans.tj", "Ministry of Transport Tajikistan", "mintrans-tj"],
  ["badea.org", "BADEA", "badea"],
  ["uzbekistonmet.uz", "Uzbekistan Metallurgy", "uzbekistonmet"],
  ["rbf.gov.fj", "Reserve Bank of Fiji", "rbf-fj"],
  ["procureware.com", "ProcureWare", "procureware"],
  ["moee.gov.eg", "Ministry of Electricity Egypt", "moee-eg"],
  ["9ten.online", "9ten", "9ten"],
  ["uzsuv.uz", "Uzsuv", "uzsuv"],
  ["dss.go.th", "DSS Thailand", "dss-th"],
  ["turkmenhimiya.gov.tm", "Türkmenhimiya", "turkmenhimiya"],
];
for (const [host, canonical, code] of platforms) {
  await c.query(
    `INSERT INTO crm_platform_aliases (canonical,platform_code,alias,host,kind,name_i18n,is_active)
     VALUES (?,?,?,?, 'platform', ?, 1)
     ON DUPLICATE KEY UPDATE canonical=VALUES(canonical), platform_code=VALUES(platform_code),
       host=VALUES(host), name_i18n=VALUES(name_i18n), is_active=1`,
    [canonical, code, host, host, JSON.stringify({ zh: canonical, en: canonical })],
  );
}
const [r] = await c.query(
  `UPDATE crm_notice_public p
     JOIN crm_platform_aliases a ON a.host=p.platform_name AND a.kind='platform' AND a.is_active=1
      SET p.platform_name=a.canonical
    WHERE NOT (p.platform_name <=> a.canonical)`,
);
console.log({ platforms: platforms.length, updated: (r as { affectedRows?: number }).affectedRows });
const [n] = await c.query(`SELECT COUNT(*) n, SUM(platform_name LIKE '%.%') host_like, SUM(platform_name IS NULL OR platform_name='') missing FROM crm_notice_public`);
console.log((n as Array<Record<string, unknown>>)[0]);
await c.end();
