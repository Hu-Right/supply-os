/**
 * 行业级联下拉 Hook — 门类 → 大类 → 中类 → 小类
 * Industry cascade hook
 *
 * @module features/supplier/hooks/useIndustryCascade
 * @description 供应商页把行业从「门类 chip + 行业关键词框」改成商机页那种逐级下拉，本 hook 负责
 *              各级选项的装载与选中态推导。与商机页 useCommodityCascade 的实质差别只有一处：
 *              **行业码链可纯字符串推导**（门禁 I4「父码 = 自身码去掉末两位」），所以不需要
 *              像品目那样为一个深链回表点查大类——给一个 UGT-I-03260701 就能截出它上面的每一层。
 *
 *              选中态是**单一行业节点码**（门类/大类/中类/小类任一层），由页面持有并直接喂
 *              /api/suppliers?industry_code=（子树前缀筛，命中该节点及其全部子孙的挂靠）。
 *              各级下拉只是把这个码「点亮到它所在的层」并允许逐层下钻/上退：
 *                - 选第 i 级的某个节点 → 选中码就是它（更深层自动清空，因为它的祖先链不含旧深层）；
 *                - 清空第 i 级 → 退回上一级（选中码 = 上一级的祖先，第 0 级清空即回到「全部」）。
 *
 *              四级都读完整分类树：门类一层走 /api/industries/facets，第 2~4 级按需向 /api/industries/tree
 *              要子级。零挂靠节点同样展示、同样可选——选中后列表正常返回「无结果」，不再按供应商数过滤。
 *              取数失败留空且不编造选项。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { industryAncestorCodes } from "@/lib/services/industry-code";
import { fetchIndustryFacets, fetchIndustryTreeChildren, type IndustryTreeOption } from "../api";

/** 级联层数：门类 / 大类 / 中类 / 小类 */
const LEVEL_COUNT = 4;

export interface IndustryCascade {
  /** 四级选项：[0]=门类，[1]=大类，[2]=中类，[3]=小类 */
  levels: IndustryTreeOption[][];
  /** 当前选中链：[门类码, 大类码, 中类码, 小类码]，未选到为空串 */
  selectedKeys: string[];
  /** 某一级选中变更（code 为空串表示清空该级 → 退回上一级） */
  onChange: (level: number, code: string) => void;
  /** 门类一层是否已落定（成功或失败都算）：未落定给骨架，避免把「接口挂了」显示成永久加载 */
  loaded: boolean;
}

/** 把选中码截成定长四级的祖先链；非法/空码返回全空（宁可不点亮也不拿错键去筛） */
function chainToLevels(code: string): string[] {
  const out = ["", "", "", ""];
  const chain = industryAncestorCodes(code);
  for (let i = 0; i < Math.min(chain.length, LEVEL_COUNT); i += 1) out[i] = chain[i];
  return out;
}

const EMPTY_CHILDREN = (): IndustryTreeOption[][] => [[], [], []];

export function useIndustryCascade({
  selectedCode,
  onSelect,
}: {
  /** 当前选中行业码（任一层级，空串=全部） */
  selectedCode: string;
  /** 选中变更：把新的最深码交回页面（页面据此筛供应商列表） */
  onSelect: (code: string) => void;
}): IndustryCascade {
  const chain = useMemo(() => chainToLevels(selectedCode), [selectedCode]);
  const [sections, setSections] = useState<IndustryTreeOption[]>([]);
  const [children, setChildren] = useState<IndustryTreeOption[][]>(EMPTY_CHILDREN);
  const [loaded, setLoaded] = useState(false);

  // ── 第一级：门类（一次，与界面语言无关，接口同返中英名）──
  useEffect(() => {
    let cancelled = false;
    fetchIndustryFacets()
      .then((rows) => {
        if (cancelled) return;
        setSections(Array.isArray(rows) ? rows : []);
        setLoaded(true);
      })
      .catch((e) => {
        console.warn("[useIndustryCascade] 门类加载失败:", e);
        if (!cancelled) setLoaded(true); // 失败也算落定：不能把页面停在永久骨架
      });
    return () => { cancelled = true; };
  }, []);

  // ── 第 2~4 级：按需拉链上每一层的直接子级（父码在链里才问，问不到就空）──
  useEffect(() => {
    let cancelled = false;
    const jobs: Array<{ slot: number; parent: string }> = [];
    for (let i = 0; i < LEVEL_COUNT - 1; i += 1) if (chain[i]) jobs.push({ slot: i, parent: chain[i] });
    if (jobs.length === 0) {
      setChildren((prev) => (prev.some((l) => l.length > 0) ? EMPTY_CHILDREN() : prev));
      return;
    }
    (async () => {
      const next = EMPTY_CHILDREN();
      await Promise.all(
        jobs.map(async ({ slot, parent }) => {
          try {
            const rows = await fetchIndustryTreeChildren(parent);
            next[slot] = Array.isArray(rows) ? rows : [];
          } catch {
            next[slot] = [];
          }
        }),
      );
      if (!cancelled) setChildren(next);
    })();
    return () => { cancelled = true; };
  }, [chain]);

  const levels = useMemo<IndustryTreeOption[][]>(
    () => [sections, children[0], children[1], children[2]],
    [sections, children],
  );

  const onChange = useCallback(
    (level: number, code: string) => {
      // 选中即最深码；清空该级则退回上一级祖先（第 0 级清空 = 回到全部，无筛）
      onSelect(code || chain[level - 1] || "");
    },
    [chain, onSelect],
  );

  return { levels, selectedKeys: chain, onChange, loaded };
}
