/**
 * 品目偏好三级级联 Hook（UGT 骨架树）
 * Commodity Preference Cascade Hook
 *
 * @module features/auth/hooks/useCommodityPrefCascade
 * @description 注册表单与已登录面板共用的三级级联状态（大类 → 中类 → 小类）：
 *              一级是 32 个 L1 大类行（树接口直出，树名即展示名），二/三级按父码向
 *              品目树接口拉选项。推断路径回填采用"同步写值 + fetch 仅加载选项列表"方案：
 *              applyInferredCode 在调用瞬间同步写入三级选中值，状态立即正确，
 *              彻底消除"异步回填未完成即提交"导致的校验失败竞态。
 *              2026-10-15 G 码退役：一级码即 L1 树码，节点所属大类按码前缀切片（零查库），
 *              旧「大类码要点查 resolve 反查」的例外整个消失。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { commodityNodeChain } from "@/shared/constants/commodity-code";
import {
  fetchCommodityTreeChildren,
  type CommodityTreeOption,
} from "@/features/procurement/api/commodityTree";

export interface UseCommodityPrefCascadeReturn {
  /** 一级选项：32 个 L1 大类行（树接口直出，名字即树名） */
  groupOptions: CommodityTreeOption[];
  subOptions: CommodityTreeOption[];
  subOptions2: CommodityTreeOption[];
  prefGroup: string;
  prefLevel2: string;
  prefLevel3: string;
  setPrefGroup: (value: string) => void;
  setPrefLevel2: (value: string) => void;
  setPrefLevel3: (value: string) => void;
  handleGroupChange: (value: string) => void;
  handleLevel2Change: (value: string) => void;
  /** 按推断/回填的节点码同步回填级联（所属大类由码前缀切片，同步写值，fetch 仅加载选项） */
  applyInferredCode: (code: string) => void;
  /** 重置所有级联状态（切换账号时调用） */
  resetCascade: () => void;
}

export function useCommodityPrefCascade(): UseCommodityPrefCascadeReturn {
  const [groupOptions, setGroupOptions] = useState<CommodityTreeOption[]>([]);
  const [subOptions, setSubOptions] = useState<CommodityTreeOption[]>([]);
  const [subOptions2, setSubOptions2] = useState<CommodityTreeOption[]>([]);
  const [prefGroup, setPrefGroup] = useState("");
  const [prefLevel2, setPrefLevel2] = useState("");
  const [prefLevel3, setPrefLevel3] = useState("");

  // 一级选项装载（树接口 parent 为空直出 L1 行）
  useEffect(() => {
    let cancelled = false;
    fetchCommodityTreeChildren("")
      .then((rows) => { if (!cancelled) setGroupOptions(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setGroupOptions([]); });
    return () => { cancelled = true; };
  }, []);

  // 推断触发计数器：每次 applyInferredCode 递增，用作选项加载 effect 的额外依赖。
  // 解决关键场景：用户清空输入后重新输入，若两次推断命中同一大类，
  // setPrefGroup 是空操作（React bail out），选项加载 effect 不会重新触发。
  // inferredTick 确保即使大类不变也强制重新拉取选项列表。
  const [inferredTick, setInferredTick] = useState(0);

  // 选定大类后加载二级选项（仅用于下拉展示，不改动已选值）
  useEffect(() => {
    if (!prefGroup) {
      setSubOptions([]);
      return;
    }
    fetchCommodityTreeChildren(prefGroup)
      .then((rows) => setSubOptions(Array.isArray(rows) ? rows : []))
      .catch(() => setSubOptions([]));
  }, [prefGroup, inferredTick]);

  // 选定二级后加载三级选项（仅用于下拉展示，不改动已选值）
  useEffect(() => {
    if (!prefLevel2) {
      setSubOptions2([]);
      return;
    }
    fetchCommodityTreeChildren(prefLevel2)
      .then((rows) => setSubOptions2(Array.isArray(rows) ? rows : []))
      .catch(() => setSubOptions2([]));
  }, [prefLevel2]);

  // 手动改选大类：二/三级随之失效
  const handleGroupChange = useCallback((value: string) => {
    setPrefGroup(value);
    setPrefLevel2("");
    setPrefLevel3("");
  }, []);

  // 手动改选二级：三级失效
  const handleLevel2Change = useCallback((value: string) => {
    setPrefLevel2(value);
    setPrefLevel3("");
  }, []);

  /** 按节点码同步回填三级：状态在调用瞬间即正确，不依赖异步 fetch。
   *  fetch 只负责拉取选项列表供下拉展示，回显在选项加载后自动呈现。
   *  仅回填用户在 UI 可见的三级；L4/L5 不进入级联也不持久化。
   *  第一级键 = 码前缀切片（chain[0]），无网络往返。
   */
  const applyInferredCode = useCallback((code: string) => {
    if (!code) return;
    const chain = commodityNodeChain(code);
    setPrefGroup(chain[0]);
    setPrefLevel2(chain[1]);
    setPrefLevel3(chain[2]);
    setInferredTick((t) => t + 1);
  }, []);

  /** 重置所有级联状态（切换账号时调用） */
  const resetCascade = useCallback(() => {
    setPrefGroup("");
    setPrefLevel2("");
    setPrefLevel3("");
    setSubOptions([]);
    setSubOptions2([]);
  }, []);

  // ★ 依赖数组必须包含所有 state 值，否则 useMemo 闭包捕获的选中值永远是旧值——
  // applyInferredCode 更新 state 后，返回的对象仍为缓存的旧快照，导致下拉不回显。
  return useMemo(() => ({
    groupOptions,
    subOptions,
    subOptions2,
    prefGroup,
    prefLevel2,
    prefLevel3,
    setPrefGroup,
    setPrefLevel2,
    setPrefLevel3,
    handleGroupChange,
    handleLevel2Change,
    applyInferredCode,
    resetCascade,
  }), [
    groupOptions, subOptions, subOptions2,
    prefGroup, prefLevel2, prefLevel3,
    handleGroupChange, handleLevel2Change, applyInferredCode, resetCascade,
  ]);
}
