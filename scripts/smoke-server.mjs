// scripts/smoke-server.mjs — 用法：先 npm run dev，另开终端 node scripts/smoke-server.mjs
const BASE = process.env.SMOKE_BASE || "http://localhost:3039";
const endpoints = [
  "/api/leads",
  "/api/suppliers?lang=zh",
  "/api/certifications",
  "/api/unspsc/industries?lang=zh",
  "/api/opportunities",
  "/api/notices?page=1&pageSize=5",
  "/api/notices/countries",
  "/api/membership/plans",
  "/api/payment/config-status",
  "/api/payments/config-status",
  "/api/procurement/schema-status",
  "/api/training/downloads/stats",
  "/api/auth/user?user_key=smoke@test.local",
];
let failed = 0;
for (const ep of endpoints) {
  try {
    const res = await fetch(BASE + ep);
    const ok = res.status < 500;
    console.log(`${ok ? "PASS" : "FAIL"} ${res.status} ${ep}`);
    if (!ok) failed++;
  } catch (e) {
    console.log(`FAIL ERR ${ep} ${e.message}`);
    failed++;
  }
}
console.log(failed === 0 ? "SMOKE OK" : `SMOKE FAILED: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
