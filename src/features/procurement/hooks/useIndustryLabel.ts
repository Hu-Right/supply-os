/**
 * 公告行业码 → 可读行业名（前端解析）
 *
 * @module features/procurement/hooks/useIndustryLabel
 * @description `notice_public.industry` 存的是行业树码（UGT-I-…）或历史 canonical 英文 slug，
 *              直接展示会把 UGT-I-17 这类编码透给用户。本 hook 负责：
 *              1) 树码（UGT-I-XX 门类 / 更深层级）→ 调公开行业树接口取 nameZh/nameEn；
 *              2) 历史 slug（medical/building/…）→ 先映射到对应门类码（industryTreeSection），
 *                 再取门类名；
 *              3) 无法解析时返回 null，调用方隐藏该行（不把编码透到界面）。
 *              行业树接口本身带 10min 缓存，跨公告复用，不额外增加详情页请求压力。
 */
import { useEffect, useState } from "react";
import { apiCached } from "@/core/http";
import { industryTreeSection } from "@/shared/utils/industry-section";
import type { IndustryTreeOption } from "@/types";

/** 行业树码形制：UGT-I- + 2/4/6/8 位数字（门类 / 大类 / 中类 / 小类） */
const INDUSTRY_CODE_RE = /^UGT-I-\d{2,8}$/;

/** UGT-I-XX（门类层，8 字符）的码长 */
const SECTION_CODE_LEN = 8;

/** 原始 industry 值 → 可用的行业树码（历史 slug 走 canonical→门类映射） */
function toIndustryCode(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (INDUSTRY_CODE_RE.test(value)) return value;
  return industryTreeSection(value);
}

function pickName(options: IndustryTreeOption[], code: string, locale: string): string | null {
  const hit = options.find((item) => item.key === code);
  if (!hit) return null;
  const zh = String(hit.nameZh ?? "").trim();
  const en = String(hit.nameEn ?? "").trim();
  return locale.toLowerCase().startsWith("zh") ? (zh || en) : (en || zh);
}

export function useIndustryLabel(raw: string | null | undefined, locale: string): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const code = toIndustryCode(String(raw ?? ""));
    if (!code) {
      setLabel(null);
      return;
    }
    const load = async (): Promise<void> => {
      try {
        const options = code.length === SECTION_CODE_LEN
          // 门类层：/api/industries/facets 直接返回全部 L1（公开、10min 缓存）
          ? await apiCached<IndustryTreeOption[]>("/api/industries/facets", 10 * 60 * 1000)
          // 更深层级：取父码的直接子节点（同样 10min 缓存）
          : await apiCached<IndustryTreeOption[]>(
            `/api/industries/tree?parent=${encodeURIComponent(code.slice(0, -2))}`,
            10 * 60 * 1000,
          );
        if (!cancelled) setLabel(pickName(options, code, locale));
      } catch {
        if (!cancelled) setLabel(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [raw, locale]);

  return label;
}
