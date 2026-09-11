"use client";

/**
 * 需求广场
 * RFQ Plaza
 *
 * @module features/rfq/components/RfqPlaza
 * @description 已发布 RFQ 的可检索列表：关键词 + 国家 + 预算筛选与排序。
 *              数据从 GET /api/rfq/list 获取（替代旧版 PLAZA_RFQS 静态数组）。
 *              未登录点击"查看详情"唤起登录弹层（信息脱敏策略）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, Gem, Search, Users } from "lucide-react";

import { cn } from "@/shared/utils";
import { Button, CountryFlag, EmptyState, Input, SegmentedControl, Select } from "@/shared/ui";
import { emitAppEvent } from "@/core/events";
import { api } from "@/core/http";
import { provinces as chinaProvinces } from "@/data/chinaDivision";
import { fetchUnspscIndustries, type UnspscOption } from "@/core/unspsc";
import type { PlazaRfq } from "../types";

type SortKey = "newest" | "deadline" | "budget";

const TAG_COLORS: Record<string, string> = {
  "能源/光伏": "bg-amber-50 text-amber-700 border-amber-200",
  "医疗/设备": "bg-blue-50 text-blue-700 border-blue-200",
  "医疗/耗材": "bg-sky-50 text-sky-700 border-sky-200",
  "机械/工程": "bg-secondary-100 text-secondary-700 border-secondary-200",
  "化工/原料": "bg-teal-50 text-teal-700 border-teal-200",
  "农业/食品": "bg-lime-50 text-lime-700 border-lime-200",
  "IT/设备": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "教育/设备": "bg-violet-50 text-violet-700 border-violet-200",
};

/** 距截止剩余（毫秒）；按本地时区解析 yyyy-MM-dd */
function remainingMs(deadline: string): number {
  if (!deadline) return 0;
  const [y, m, d] = deadline.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).getTime() - Date.now();
}

interface ApiResponse {
  items: PlazaRfq[];
  total: number;
  page: number;
  page_size: number;
}

export function RfqPlaza() {
  const [keyword, setKeyword] = useState("");
  const [province, setProvince] = useState("");
  const [categoryL1, setCategoryL1] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [items, setItems] = useState<PlazaRfq[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [l1Options, setL1Options] = useState<UnspscOption[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载 UNSPSC 一级分类
  useEffect(() => {
    fetchUnspscIndustries("zh").then(setL1Options).catch(() => setL1Options([]));
  }, []);

  // 构建查询参数
  const queryParams = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("page_size", "24");
    sp.set("sort", sort);
    if (keyword.trim()) sp.set("q", keyword.trim());
    if (province) sp.set("province", province);
    if (categoryL1) sp.set("category_l1", categoryL1);
    return sp.toString();
  }, [keyword, province, categoryL1, sort]);

  // 防抖请求
  const fetchList = useCallback(() => {
    setLoading(true);
    api<ApiResponse>(`/api/rfq/list?${queryParams}`)
      .then((res) => {
        setItems(Array.isArray(res.items) ? res.items : []);
        setTotal(Number(res.total) || 0);
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [queryParams]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fetchList, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [fetchList]);

  return (
    <section className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs" id="rfq-plaza">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-extrabold text-secondary-900">需求广场</h2>
          <p className="text-xs text-secondary-400 mt-1">
            来自全球采购方的真实需求{total > 0 && `（${total} 条）`}，登录后可查看详情
          </p>
        </div>
        <SegmentedControl size="sm" value={sort} onChange={(v) => setSort(v as SortKey)}
          items={[
            { value: "newest", label: "最新发布" },
            { value: "deadline", label: "截止临近" },
            { value: "budget", label: "预算最高" },
          ]} />
      </div>

      {/* 筛选行 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-5">
        <Input leftIcon={<Search className="w-4 h-4" />} value={keyword}
          onChange={(e) => setKeyword(e.target.value)} placeholder="搜索需求关键词" aria-label="搜索需求关键词" />
        <Select value={categoryL1} onChange={(e) => setCategoryL1(e.target.value)} aria-label="行业筛选">
          <option value="">全部行业</option>
          {l1Options.map((o) => <option key={o.id} value={String(o.id)}>{o.title_zh || o.title || o.code}</option>)}
        </Select>
        <Select value={province} onChange={(e) => setProvince(e.target.value)} aria-label="省份筛选">
          <option value="">全部省份</option>
          {chinaProvinces.map((p) => <option key={p.code} value={p.name}>{p.name}</option>)}
        </Select>
      </div>

      {/* 列表 */}
      {loading && items.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-secondary-100 p-4 animate-pulse">
              <div className="h-4 w-16 bg-secondary-100 rounded mb-3" />
              <div className="h-4 w-full bg-secondary-100 rounded mb-2" />
              <div className="h-3 w-3/4 bg-secondary-50 rounded mb-2" />
              <div className="h-3 w-1/2 bg-secondary-50 rounded" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="暂无采购需求"
          description="平台正在收集全球采购方的真实需求，你也可以先发布你的采购需求"
          action={<Button onClick={() => document.getElementById("rfq-form")?.scrollIntoView({ behavior: "smooth" })}>发布你的需求</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {items.map((rfq) => (
            <PlazaCard key={rfq.id} rfq={rfq} />
          ))}
        </div>
      )}
    </section>
  );
}

function PlazaCard({ rfq }: { rfq: PlazaRfq }) {
  const remain = remainingMs(rfq.deadline);
  const urgent = remain > 0 && remain < 72 * 3600 * 1000;
  const remainText = !rfq.deadline
    ? "长期有效"
    : remain <= 0
      ? "已截止"
      : remain < 24 * 3600 * 1000
        ? `剩 ${Math.max(1, Math.round(remain / 3600 / 1000))} 小时`
        : `剩 ${Math.ceil(remain / 24 / 3600 / 1000)} 天`;

  return (
    <div className={cn(
      "relative flex flex-col rounded-xl border p-4 transition-shadow hover:shadow-md",
      rfq.boosted ? "border-primary-300 bg-primary-50/30" : "border-secondary-200",
    )}>
      {rfq.boosted && (
        <span className="absolute -top-2.5 right-3 inline-flex items-center gap-1 rounded-full bg-primary-600 px-2 py-0.5 text-2xs font-bold text-white">
          <Gem className="w-3 h-3" /> 精选
        </span>
      )}
      <div className="flex items-center gap-2 mb-2">
        {rfq.tag && (
          <span className={cn("inline-block rounded border px-2 py-0.5 text-2xs font-bold", TAG_COLORS[rfq.tag] ?? "bg-secondary-100 text-secondary-700 border-secondary-200")}>
            {rfq.tag}
          </span>
        )}
        {urgent && (
          <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-2xs font-bold text-amber-700">
            <Clock className="w-3 h-3" /> {remainText}
          </span>
        )}
      </div>
      <h4 className="text-sm font-bold text-secondary-900 mb-2 leading-snug line-clamp-2">{rfq.title}</h4>
      <div className="space-y-1 text-xs text-secondary-500 flex-1">
        {rfq.province && (
          <p className="flex items-center gap-1.5">
            <CountryFlag name="China" /> {rfq.province}
          </p>
        )}
        <p>预算：{rfq.budgetDisplay}</p>
        {rfq.deadline && (
          <p className={cn("flex items-center gap-1", urgent && "text-amber-700 font-bold")}>
            <Clock className="w-3 h-3" /> 截止 {rfq.deadline}（{remainText}）
          </p>
        )}
      </div>
      <Button variant="outline" size="sm" className="mt-3 w-full"
        onClick={() => emitAppEvent("supply-os:require-login")}>
        查看详情
      </Button>
    </div>
  );
}
