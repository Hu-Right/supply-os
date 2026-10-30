/**
 * 定向服务表重建：按买家名圈行，重跑唯一写入者链路（fetch → buildPublicRow → upsert）。
 *
 * 为什么存在：--changed 水位只含主表/商机/标题旁表（selectChangedPublicIds），
 * buyer_translation / agency_aliases 的改名不会重选已有行——中文名落库后必须用本脚本
 * 圈出相关买家的服务表行强制重建，列表页 buyer_name_cn 才会刷新。
 *
 * 圈行用 ai_ci IN（utf8mb4_0900_ai_ci 大小写/重音不敏感），同一买家的所有变体行一并重建；
 * 重建后变体经别名 canonical 统一。买家清单与
 * runtime/agency-alias-zh-head-20261030.sql / runtime/buyer-translation-zh-head-20261030.sql 同源。
 *
 * 用法（服务器 /root/supply-os 下执行，.env 即部署凭证）：
 *   npx tsx scripts/tools/notice-public-rebuild-buyers.ts            # DRY：只报圈中行数
 *   npx tsx scripts/tools/notice-public-rebuild-buyers.ts --apply    # 真正写服务表
 */
import { readFileSync } from "node:fs";
import mysql, { type RowDataPacket } from "mysql2/promise";
import {
  buildPublicRow, fetchPublicInputRows, loadPublicBuildContext, upsertPublicRows,
} from "../../src/lib/services/notice-public/build";

const APPLY = process.argv.includes("--apply");
const CHUNK = 500;

const BUYERS = [
  "Delhi Development Authority",
  "DG,BSF,MHA",
  "Archaeological Survey of India",
  "Defence Research and Development Organisation",
  "Delhi University",
  "Indian Institute of Technology Roorkee",
  "Assam Rifles - MHA",
  "Food Corporation of India",
  "Engineers India Limited,MoPNG",
  "DG, Indo-Tibetan Border Police Force",
  "DG,CRPF,MHA",
  "Postgraduate Institute of Medical and Education and Research Chandigarh",
  "The Fertilisers And Chemicals Travancore Ltd.",
  "NHPC Limited",
  "Bhabha Atomic Research Centre",
  "South African National Roads Agency Soc Limited (SANRAL)",
  "Road Accident Fund",
  "Ethekwini Metropolitan Municipality",
  "National Research Foundation",
  "Air Traffic and Navigation Services Company Limited",
  "Kwazulu Natal - Public Works (Head Office)",
  "KZN Growth Fund Trust",
  "Transnet National Ports Authority",
  "Water and Sanitation",
  "Tourism",
  "Public Works",
  "Miejskie Przedsiębiorstwo Wodociągów i Kanalizacji w m. st. Warszawie S.A.",
  "PKP Polskie Linie Kolejowe S.A.",
  "KOMENDA GŁÓWNA POLICJI",
  "Gemeente Rotterdam",
  "London Borough of Haringey",
  "Newry, Mourne and Down District Council (NMD)",
  "Ředitelství silnic a dálnic s. p.",
  "Servicio de Salud de las Illes Balears",
  "MONTEPUT DOO PODGORICA",
  "The Belmedtechnical",
  "Эрдэнэт үйлдвэр",
  "Дарханы төмөрлөгийн үйлдвэр",
  "ENERGY, DEPARTMENT OF",
  "Manitoba Transportation and Infrastructure - Tendering and Contracts",
  "The Ministry of Internal Affairs of Georgia",
  "Nepal Electricity Authority",
  "DIRECCION GENERAL DE AERONAUTICA CIVIL",
  "Bangkok",
  "FME",
];

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
  connectionLimit: 2,
});

try {
  const [rows] = await pool.query(
    `SELECT notice_pk FROM notice_public
      WHERE buyer_name IN (${BUYERS.map(() => "?").join(",")})
      ORDER BY notice_pk`,
    BUYERS,
  );
  const ids = (rows as RowDataPacket[]).map((r) => Number(r.notice_pk));
  console.log(`[notice-public-buyers] 圈中 ${ids.length} 行（${BUYERS.length} 买家，ai_ci 含全部变体）`);
  if (!APPLY) {
    console.log("[notice-public-buyers] DRY：加 --apply 才写服务表");
    process.exit(0);
  }
  const ctx = await loadPublicBuildContext(pool);
  let written = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const input = await fetchPublicInputRows(pool, chunk);
    const params: unknown[][] = [];
    for (const r of input.rows) {
      const row = buildPublicRow(r, ctx, input);
      if (row) params.push(row);
    }
    try {
      written += await upsertPublicRows(pool, params);
    } catch (chunkErr) {
      // 与 rebuild.ts 同款降级：单行坏数据不得毒化整块
      for (const row of params) {
        try {
          written += await upsertPublicRows(pool, [row]);
        } catch (rowErr) {
          console.error(`[notice-public-buyers] 单行写入失败（已隔离，notice_pk=${row[0]}）:`, (rowErr as Error).message);
        }
      }
      console.warn(`[notice-public-buyers] 块写入失败已逐行降级（${i}-${i + params.length}）:`, (chunkErr as Error).message);
    }
  }
  console.log(`[notice-public-buyers] 重建完成：圈中 ${ids.length} · 写入 ${written}`);
} finally {
  await pool.end();
}
