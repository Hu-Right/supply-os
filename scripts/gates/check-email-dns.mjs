#!/usr/bin/env node
/**
 * 邮箱发件域认证自检 —— SPF / DKIM / DMARC
 *
 * 用法：
 *   npm run check:email-dns                 # 检查 SMTP_FROM 所在域
 *   npm run check:email-dns -- --domain example.com --domain mail.example.com
 *   npm run check:email-dns -- --domain example.com --selector s1 --selector dkim
 *
 * 判定：
 *   SPF 缺失 / DKIM 缺失 → 退出码 1（海外收件方基本判垃圾或拒收）
 *   DMARC 缺失或 p=none  → 仅告警（可发，但无法要求收件方处置仿冒）
 *
 * 只读 DNS，不改任何配置；记录值需到域名/DNS 服务商处添加。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resolver } from "node:dns/promises";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** 读取 .env（只做最简 KEY=VALUE 解析；shell 环境变量优先） */
function loadEnv() {
  const out = {};
  const file = path.join(ROOT, ".env");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return { ...out, ...process.env };
}

function argValues(flag) {
  const argv = process.argv.slice(2);
  const values = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && argv[i + 1]) values.push(argv[++i]);
    else if (argv[i].startsWith(`${flag}=`)) values.push(argv[i].slice(flag.length + 1));
  }
  return values;
}

function domainOf(address) {
  const m = String(address || "").match(/@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  return m ? m[1].toLowerCase() : "";
}

const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

async function txt(name) {
  try {
    const rows = await resolver.resolveTxt(name);
    return rows.map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

async function cname(name) {
  try {
    return await resolver.resolveCname(name);
  } catch {
    return [];
  }
}

async function mx(domain) {
  try {
    return (await resolver.resolveMx(domain)).map((r) => r.exchange);
  } catch {
    return [];
  }
}

const env = loadEnv();
const from = env.SMTP_FROM || "";
const smtpUser = env.SMTP_USER || "";

const domains = [...new Set(argValues("--domain").map((d) => d.toLowerCase()))];
if (domains.length === 0) {
  const d = domainOf(from) || domainOf(smtpUser);
  if (d) domains.push(d);
}
if (domains.length === 0) {
  console.error("无法确定检查域名：请配置 SMTP_FROM，或使用 --domain example.com");
  process.exit(2);
}

const COMMON_SELECTORS = ["default", "aliyun", "dkim", "mail", "s1", "selector1", "k1", "google"];
const selectors = [...new Set([...argValues("--selector"), env.SMTP_DKIM_SELECTOR || "", ...COMMON_SELECTORS].filter(Boolean))];

let hardFail = false;

for (const domain of domains) {
  const spf = (await txt(domain)).filter((v) => /^v=spf1\b/i.test(v));
  const dmarc = (await txt(`_dmarc.${domain}`)).filter((v) => /^v=DMARC1\b/i.test(v));
  const mailExchangers = await mx(domain);

  let dkimSelector = "";
  let dkimRecord = "";
  for (const sel of selectors) {
    const name = `${sel}._domainkey.${domain}`;
    let records = (await txt(name)).filter((v) => /^v=DKIM1\b/i.test(v));
    if (records.length === 0) {
      const aliases = await cname(name);
      for (const alias of aliases) {
        records = (await txt(alias)).filter((v) => /^v=DKIM1\b/i.test(v));
        if (records.length > 0) break;
      }
    }
    if (records.length > 0) {
      dkimSelector = sel;
      dkimRecord = records[0];
      break;
    }
  }

  console.log(`\n=== 发件域 ${domain} ===`);
  console.log(`From: ${from || "(未配置 SMTP_FROM)"}`);
  console.log(`MX:   ${mailExchangers.length ? mailExchangers.join(", ") : "(无)"}`);

  if (spf.length > 0) {
    console.log(`[PASS] SPF    ${spf[0]}`);
    if (/\s\+all\b/.test(spf[0])) console.log("       ⚠ SPF 含 +all，等于允许任意 IP 代发，建议改为 -all 或 ~all");
  } else {
    hardFail = true;
    console.log("[FAIL] SPF    缺失 —— 收件方无法确认该域的发信 IP 授权");
    console.log("       操作：在 DNS 添加 TXT 记录，值由 SMTP 服务商给出（阿里云邮箱为 include:spf1.dm.aliyun.com，DirectMail 以控制台为准）");
  }

  if (dkimSelector) {
    console.log(`[PASS] DKIM   selector=${dkimSelector}（${dkimRecord.slice(0, 48)}…）`);
  } else {
    hardFail = true;
    console.log(`[FAIL] DKIM   未找到（已尝试选择器：${selectors.join(", ")}）`);
    console.log(`       操作：在 SMTP 服务商控制台开启 DKIM，把公钥加到 <selector>._domainkey.${domain} 的 TXT`);
    if (domainOf(from) && domainOf(smtpUser) && domainOf(from) !== domainOf(smtpUser)) {
      console.log("       From 域与 SMTP 登录域不一致，SPF 无法对齐，DKIM 是唯一能通过 DMARC 的手段");
    }
  }

  if (dmarc.length > 0) {
    const policy = dmarc[0].match(/\bp=(\w+)/)?.[1] || "?";
    const level = policy === "none" ? "WARN" : "PASS";
    console.log(`[${level}] DMARC  ${dmarc[0]}`);
    if (policy === "none") console.log("       建议观察一段时间无异常后把 p=none 收紧到 p=quarantine");
  } else {
    console.log("[WARN] DMARC  缺失 —— 可发信，但无法要求收件方处置仿冒邮件，且部分收件方会降权");
    console.log(`       操作：添加 TXT 记录 _dmarc.${domain} = v=DMARC1; p=none; rua=mailto:dmarc@${domain}`);
  }
}

if (hardFail) {
  console.log("\n结论：存在硬性认证缺口（SPF 或 DKIM），海外投递会被判垃圾或拒收。");
  process.exit(1);
}
console.log("\n结论：SPF / DKIM 均就绪。");
