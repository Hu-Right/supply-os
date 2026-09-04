/**
 * 学习资料数据 Hook（架构评估 C5：补齐 learning 的 hooks 层）
 *
 * @module features/learning/hooks/useLearningMaterials
 * @description 承载原 LearningPage 内联的数据获取：资料+套餐加载、
 *              已购资料集合刷新（登录态变化时自动同步）。
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/core/auth";
import { api } from "@/core/http";
import type { LearningMaterial } from "@/types";

interface ApiMaterial {
  id: string;
  titleZh: string;
  titleEn: string;
  categoryZh: string;
  categoryEn: string;
  summaryZh: string;
  summaryEn: string;
  contentZh: string;
  contentEn: string;
  isPremium: boolean;
  downloadsCount: number;
  number: number;
  price: number;
  fileUrl: string;
  fileName: string;
}

interface ApiBundle {
  id: string;
  labelZh: string;
  labelEn: string;
  includesIds: string[];
  price: number;
}

export function useLearningMaterials() {
  const { authUser } = useAuth();
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [bundles, setBundles] = useState<ApiBundle[]>([]);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // 加载资料 + 套餐
  const loadMaterials = useCallback(async () => {
    try {
      const [matRes, bundleRes] = await Promise.all([
        api<{ materials: ApiMaterial[] }>("/api/learning/materials"),
        api<{ bundles: ApiBundle[] }>("/api/learning/bundles"),
      ]);
      setMaterials(
        (matRes.materials ?? []).map((m) => ({
          id: m.id,
          titleZh: m.titleZh,
          titleEn: m.titleEn,
          categoryZh: m.categoryZh,
          categoryEn: m.categoryEn,
          summaryZh: m.summaryZh,
          summaryEn: m.summaryEn,
          contentZh: m.contentZh,
          contentEn: m.contentEn,
          isPremium: m.isPremium,
          downloadsCount: m.downloadsCount,
          number: m.number,
          price: m.price,
          fileUrl: m.fileUrl,
          fileName: m.fileName,
        })),
      );
      setBundles(bundleRes.bundles ?? []);
    } catch {
      // 静默失败
    }
  }, []);

  // 刷新已购资料列表
  const refreshPurchased = useCallback(async () => {
    if (!authUser) {
      setPurchasedIds(new Set());
      return;
    }
    try {
      const data = await api<{ material_ids: string[] }>("/api/learning/purchased", { method: "GET" });
      setPurchasedIds(new Set(data.material_ids ?? []));
    } catch {
      // 静默失败
    }
  }, [authUser]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadMaterials().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadMaterials]);

  useEffect(() => {
    void refreshPurchased();
  }, [refreshPurchased]);

  // 登录态变化（含登出→登录切换）时同步已购列表
  useEffect(() => {
    if (authUser) void refreshPurchased();
  }, [authUser, refreshPurchased]);

  /** 本地递增指定资料的下载计数（避免重新拉取整个列表） */
  const bumpDownloadCount = useCallback((materialId: string) => {
    setMaterials((prev) =>
      prev.map((m) =>
        m.id === materialId ? { ...m, downloadsCount: m.downloadsCount + 1 } : m,
      ),
    );
  }, []);

  return { materials, bundles, purchasedIds, loading, refreshPurchased, bumpDownloadCount };
}

export type { ApiBundle };
