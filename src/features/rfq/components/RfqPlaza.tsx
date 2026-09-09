"use client";

/**
 * 需求广场
 * RFQ Plaza
 *
 * @module features/rfq/components/RfqPlaza
 * @description 已发布 RFQ 的可检索列表：关键词 + 行业 + 国家 + 预算筛选与排序。
 *              未登录点击"查看详情"唤起登录弹层（信息脱敏策略）。
 *              TODO(P1): 数据与筛选下推到 fetchRfqList 服务端接口。
 */
import { useMemo, useState } from "react";
import { Clock, Gem, Search, Users } from "lucide-react";

import { cn } from "@/shared/utils";
import { Button, CountryFlag, EmptyState, Input, SegmentedControl, Select } from "@/shared/ui";
import { emitAppEvent } from "@/core/events";
import { CATEGORY_TREE, PLAZA_RFQS, TARGET_COUNTRIES } from "../constants";
import type { PlazaRfq } from "../types";

type SortKey = "newest" | "deadline" | "responses";

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
  const [y, m, d] = deadline.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).getTime() - Date.now();
}

export function RfqPlaza() {
  const [keyword, setKeyword] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");

  const list = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const min = Number(budgetMin) || 0;
    const max = Number(budgetMax) || Infinity;
    let result = PLAZA_RFQS.filter((r) => {
      if (kw && !r.title.toLowerCase().includes(kw) && !r.tag.toLowerCase().includes(kw)) return false;
      if (industry && r.industry !== industry) return false;
      if (country && r.countryZh !== country) return false;
      if ((min > 0 || max !== Infinity) && (r.budgetUsd <= 0 || r.budgetUsd < min || r.budgetUsd > max)) return false;
      return true;
    });
    result = [...result].sort((a, b) => {
      if (sort === "deadline") return a.deadline.localeCompare(b.deadline);
      if (sort === "responses") return b.responses - a.responses;
      return b.id - a.id;
    });
    // 置顶需求恒排前
    result.sort((a, b) => Number(b.boosted ?? false) - Number(a.boosted ?? false));
    return result;
  }, [keyword, industry, country, budgetMin, budgetMax, sort]);

  return (
    <section className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs" id="rfq-plaza">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-extrabold text-secondary-900">需求广场</h2>
          <p className="text-xs text-secondary-400 mt-1">来自全球采购方的真实需求，登录后可查看详情</p>
        </div>
        <SegmentedControl size="sm" value={sort} onChange={(v) => setSort(v as SortKey)}
          items={[
            { value: "newest", label: "最新发布" },
            { value: "deadline", label: "截止临近" },
            { value: "responses", label: "响应最多" },
          ]} />
      </div>

      {/* 筛选行 */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2.5 mb-5">
        <div className="col-span-2 lg:col-span-2">
          <Input leftIcon={<Search className="w-4 h-4" />} value={keyword}
            onChange={(e) => setKeyword(e.target.value)} placeholder="搜索需求关键词" aria-label="搜索需求关键词" />
        </div>
        <Select value={industry} onChange={(e) => setIndustry(e.target.value)} aria-label="行业筛选">
          <option value="">全部行业</option>
          {CATEGORY_TREE.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
        </Select>
        <Select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="国家筛选">
          <option value="">全部国家/地区</option>
          {TARGET_COUNTRIES.map((c) => <option key={c.en} value={c.zh}>{c.zh}</option>)}
        </Select>
        <Input inputMode="decimal" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)}
          placeholder="预算≥(万)" aria-label="最低预算（万）" />
        <Input inputMode="decimal" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)}
          placeholder="预算≤(万)" aria-label="最高预算（万）" />
      </div>

      {/* 列表 */}
      {list.length === 0 ? (
        <EmptyState
          title="没有找到匹配的需求"
          description="换个筛选条件试试，或者发布你的采购需求，让供应商来找你"
          action={<Button onClick={() => document.getElementById("rfq-form")?.scrollIntoView({ behavior: "smooth" })}>发布你的需求</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {list.map((rfq) => (
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
  const remainText = remain <= 0
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
          <Gem className="w-3 h-3" /> 置顶
        </span>
      )}
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("inline-block rounded border px-2 py-0.5 text-2xs font-bold", TAG_COLORS[rfq.tag] ?? "bg-secondary-100 text-secondary-700 border-secondary-200")}>
          {rfq.tag}
        </span>
        {urgent && (
          <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-2xs font-bold text-amber-700">
            <Clock className="w-3 h-3" /> {remainText}
          </span>
        )}
      </div>
      <h4 className="text-sm font-bold text-secondary-900 mb-2 leading-snug line-clamp-2">{rfq.title}</h4>
      <div className="space-y-1 text-xs text-secondary-500 flex-1">
        <p className="flex items-center gap-1.5">
          <CountryFlag name={rfq.countryEn} /> {rfq.countryZh}
        </p>
        <p>预算：{rfq.budgetDisplay}</p>
        <p className={cn("flex items-center gap-1", urgent && "text-amber-700 font-bold")}>
          <Clock className="w-3 h-3" /> 截止 {rfq.deadline}（{remainText}）
        </p>
        <p className="flex items-center gap-1 text-primary-700 font-bold">
          <Users className="w-3 h-3" /> 已有 {rfq.responses} 家响应
        </p>
      </div>
      <Button variant="outline" size="sm" className="mt-3 w-full"
        onClick={() => emitAppEvent("supply-os:require-login")}>
        查看详情
      </Button>
    </div>
  );
}
