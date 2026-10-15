/**
 * 主营产品自报选择器（按品目骨架树）
 * Supplier self-reported main-products picker (commodity backbone)
 *
 * @module features/auth/components/SupplierProductsPicker
 * @description 归属人在企业信息编辑页勾选「贵司实际能生产的产品」：既可按五级级联逐级下钻，
 *              也可输主营关键词由品目树召回候选——**两条通路都必须用户显式点选才落选**，
 *              绝不自动回填（低置信推断静默锁定会污染匹配，与 IndustryPrefsForm 同一取舍）。
 *              落点下限锁 L2 中类（只报 L1 大类等于声称整个大类都能做，太粗）。
 *              受控组件：选中集合（code + 权威中文名）由父级持有，提交时只上抛节点码数组，
 *              服务端再据 supplier 绑定主体写 self_report（前端不碰 supplier_id）。
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import {
  fetchCommodityTreeChildren,
  type CommodityTreeOption,
} from "@/features/procurement/api/commodityTree";
import {
  fetchSmartInferCommodity,
  type CommodityInferCandidate,
} from "@/core/api/industry-prefs";
import { CommodityLevelSelector } from "@/features/procurement/components/CommodityLevelSelector";
import { CommodityInferCandidates } from "./CommodityInferCandidates";
import { commodityNodeChain, commodityNodeLevel } from "@/lib/services/commodity/tree";
import { Button, Input } from "@/shared/ui";
import type { CommodityNodeBrief } from "@/shared/hooks/useEnterpriseInfo";

const inputCls =
  "w-full px-2 py-1.5 rounded border border-border bg-white text-xs text-foreground focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 outline-none";

export interface SupplierProductsPickerProps {
  value: CommodityNodeBrief[];
  onChange: (next: CommodityNodeBrief[]) => void;
}

export function SupplierProductsPicker({ value, onChange }: SupplierProductsPickerProps) {
  const { t, locale } = useLocale();

  // ── 五级级联草稿：levels[i] 是第 i 级可选项，selectedKeys[i] 是第 i 级已选码（未选空串）──
  const [levels, setLevels] = useState<CommodityTreeOption[][]>([[], [], [], [], []]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(["", "", "", "", ""]);

  // ── 关键词候选 ──
  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<CommodityInferCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  // 一级大类装载（树接口 parent 为空直出 L1 行，与后续各级同源）
  useEffect(() => {
    let cancelled = false;
    fetchCommodityTreeChildren("")
      .then((rows) => {
        if (!cancelled) setLevels((prev) => [Array.isArray(rows) ? rows : [], prev[1], prev[2], prev[3], prev[4]]);
      })
      .catch(() => {
        /* 一级装载失败不打断页面，级联留空 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 某级选中变更：写本级、失效并清空更深层，按需拉取下级选项
  const handleCascade = useCallback((level: number, key: string) => {
    setSelectedKeys((prev) => {
      const next = [...prev];
      next[level] = key;
      for (let l = level + 1; l < 5; l++) next[l] = "";
      return next;
    });
    setLevels((prev) => {
      const next = [...prev];
      for (let l = level + 1; l < 5; l++) next[l] = [];
      return next;
    });
    if (key && level < 4) {
      fetchCommodityTreeChildren(key)
        .then((rows) => setLevels((prev) => prev.map((arr, i) => (i === level + 1 ? (Array.isArray(rows) ? rows : []) : arr))))
        .catch(() => {
          /* 取子级失败：该层留空，界面自然不给假选项 */
        });
    }
  }, []);

  // 最深已选码 + 其码长对应的层级（>=2 才可作为落点）
  const deepest = useMemo(() => {
    for (let l = 4; l >= 0; l--) {
      const code = selectedKeys[l];
      if (code) {
        const opt = levels[l].find((o) => o.key === code);
        return { code, nameZh: opt?.nameZh ?? "", level: commodityNodeLevel(code) };
      }
    }
    return null;
  }, [selectedKeys, levels]);

  const canAdd = !!deepest && deepest.level >= 2 && !value.some((v) => v.code === deepest.code);

  const resetCascade = () => {
    setSelectedKeys(["", "", "", "", ""]);
    setLevels((prev) => [prev[0], [], [], [], []]);
  };

  const addNode = (code: string, nameZh: string) => {
    if (!code || commodityNodeLevel(code) < 2) return;
    if (value.some((v) => v.code === code)) return;
    onChange([...value, { code, nameZh }]);
  };

  const handleAddFromCascade = () => {
    if (!deepest || deepest.level < 2) return;
    addNode(deepest.code, deepest.nameZh);
    resetCascade();
  };

  const removeNode = (code: string) => onChange(value.filter((v) => v.code !== code));

  // 关键词防抖推断（300ms）：命中品目树候选，由用户点选才加，不自动回填
  useEffect(() => {
    const kw = keyword.trim();
    if (kw.length < 1) {
      setCandidates([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await fetchSmartInferCommodity(kw);
        setCandidates(data?.candidates ?? []);
      } catch {
        setCandidates([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const pickCandidate = (c: CommodityInferCandidate) => {
    addNode(c.code, c.nameZh || c.nameEn);
  };

  const nodeLabel = (n: CommodityNodeBrief): string => {
    // 回填项只有中文名；级联/候选新加项带 nameZh，英文界面同样回落 nameZh（补译名是独立工作）
    return locale === "zh" ? n.nameZh || n.code : n.nameZh || n.code;
  };

  return (
    <div className="space-y-3">
      <p className="text-2xs text-muted-foreground">
        {t("authEnterpriseCommodityHint") ||
          "勾选贵司实际能生产的产品（可按五级分类逐级下钻，或输入主营关键词后从候选中点选）。用于公告/商机精准匹配，至少选到中类。"}
      </p>

      {/* 关键词候选：只产候选、由用户点选确认，杜绝低置信推断静默落选 */}
      <div>
        <Input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t("authEnterpriseCommoditySearchPh") || "输入主营产品关键词，如：LED 灯具"}
          className={inputCls}
        />
        {loading && <p className="mt-1 text-2xs text-muted-foreground">{t("authMainBusinessMatching") || "匹配中..."}</p>}
        {!loading && candidates.length > 0 && (
          <CommodityInferCandidates
            candidates={candidates}
            appliedCode={null}
            hint={t("authMainBusinessCandidatePick") || "以下为品目树匹配候选，点选即加入："}
            onPick={pickCandidate}
          />
        )}
      </div>

      {/* 五级级联 + 添加：最深已选（≥ 中类）方可加入 */}
      <div className="space-y-2">
        <CommodityLevelSelector levels={levels} selectedKeys={selectedKeys} onChange={handleCascade} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canAdd}
          onClick={handleAddFromCascade}
          className="px-3 py-1.5 text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          {t("authEnterpriseCommodityAdd") || "加入已选"}
        </Button>
      </div>

      {/* 已选 chips */}
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((n) => {
            const chain = commodityNodeChain(n.code).filter(Boolean);
            const pathText = chain.length > 0 ? chain.join(" › ") : n.code;
            return (
              <span
                key={n.code}
                title={pathText}
                className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-teal-50 border border-teal-200 text-xs text-teal-800 max-w-full"
              >
                <span className="truncate">{nodeLabel(n)}</span>
                <button
                  type="button"
                  onClick={() => removeNode(n.code)}
                  className="shrink-0 p-0.5 rounded-full hover:bg-teal-100 text-teal-500 hover:text-teal-700"
                  aria-label={t("authEnterpriseCommodityRemove") || "移除"}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-2xs text-muted-foreground">{t("authEnterpriseCommodityEmpty") || "尚未选择主营产品。"}</p>
      )}
    </div>
  );
}

SupplierProductsPicker.displayName = "SupplierProductsPicker";
