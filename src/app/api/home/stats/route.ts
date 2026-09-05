/**
 * GET /api/home/stats — 首页统计数据
 *
 * @module app/api/home/stats/route
 * @description 聚合首页数字墙所需的全部统计指标：
 *   - notices: 采购机会总量 / 活跃量
 *   - suppliers: 供应商总量 / 认证量
 *   - showrooms: 海外展厅数量
 *   - dataSources: 数据源数量（静态配置）
 * 所有计数从数据库实时查询，带 5 分钟缓存。
 */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import type { RowDataPacket } from "mysql2/promise";

interface HomeStats {
  notices: { total: number; active: number };
  suppliers: { total: number; certified: number };
  showrooms: number;
  dataSources: number;
  updatedAt: string;
}

let cache: { data: HomeStats; expires: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

async function fetchStats(): Promise<HomeStats> {
  const pool = getPool();
  const [noticeRows] = await pool.query("SELECT COUNT(*) AS total FROM crm_bid_notices");
  const [activeRows] = await pool.query(
    "SELECT COUNT(*) AS total FROM crm_bid_notices WHERE deadline >= CURDATE() AND status != 'expired'"
  );
  const [supplierRows] = await pool.query("SELECT COUNT(*) AS total FROM crm_suppliers");
  const [certifiedRows] = await pool.query(
    "SELECT COUNT(*) AS total FROM crm_suppliers WHERE is_certified = 1"
  );
  const [showroomRows] = await pool.query("SELECT COUNT(*) AS total FROM crm_exhibition_halls");

  return {
    notices: {
      total: Number((noticeRows as RowDataPacket[])[0]?.total || 0),
      active: Number((activeRows as RowDataPacket[])[0]?.total || 0),
    },
    suppliers: {
      total: Number((supplierRows as RowDataPacket[])[0]?.total || 0),
      certified: Number((certifiedRows as RowDataPacket[])[0]?.total || 0),
    },
    showrooms: Number((showroomRows as RowDataPacket[])[0]?.total || 0),
    dataSources: 20, // 静态配置：政府 & 国际组织数据源数量
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  if (cache && cache.expires > Date.now()) {
    return NextResponse.json(cache.data);
  }

  try {
    const data = await fetchStats();
    cache = { data, expires: Date.now() + CACHE_TTL };
    return NextResponse.json(data);
  } catch (err) {
    console.error("[home-stats] 查询失败:", err);
    // 降级：返回空结构
    return NextResponse.json({
      notices: { total: 0, active: 0 },
      suppliers: { total: 0, certified: 0 },
      showrooms: 0,
      dataSources: 20,
      updatedAt: new Date().toISOString(),
    });
  }
}
