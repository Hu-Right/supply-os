/**
 * 学习资料服务层
 * Learning Materials Service
 *
 * @module lib/services/learning-service
 * @description 封装学习资料查询 + 付费墙校验，供 API 路由薄壳调用。
 *              消除路由层直接 import LearningMaterialsRepo 的架构违规。
 */
import { getPool } from "@/lib/db/pool";
import { LearningMaterialsRepo } from "@/lib/repos/learning-materials.repo";

/** 学习资料列表项（API 响应格式） */
export interface LearningMaterialListItem {
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
  number: number | null;
  price: number;
  fileUrl: string;
  fileName: string;
}

/**
 * 获取全部学习资料列表（premium 资料的正文/文件不随列表下发）
 */
export async function listMaterials(): Promise<LearningMaterialListItem[]> {
  const repo = new LearningMaterialsRepo(getPool());
  const materials = await repo.findAll();
  return materials.map((m) => {
    const premium = m.is_premium === 1;
    return {
      id: m.material_id,
      titleZh: m.title_zh,
      titleEn: m.title_en,
      categoryZh: m.category_zh,
      categoryEn: m.category_en,
      summaryZh: m.summary_zh,
      summaryEn: m.summary_en,
      contentZh: premium ? "" : (m.content_zh ?? ""),
      contentEn: premium ? "" : (m.content_en ?? ""),
      isPremium: premium,
      downloadsCount: m.downloads_count,
      number: m.number,
      price: Number(m.price),
      fileUrl: premium ? "" : m.file_url,
      fileName: premium ? "" : m.file_name,
    };
  });
}

/**
 * 查询用户已购买的资料 ID 列表
 */
export async function listPurchasedMaterialIds(userId: number): Promise<string[]> {
  const repo = new LearningMaterialsRepo(getPool());
  return repo.findPurchasedMaterialIds(userId);
}

/** 资料内容获取结果 */
export interface MaterialContentResult {
  contentZh: string;
  contentEn: string;
  fileUrl: string | null;
  fileName: string | null;
}

/**
 * 获取资料正文与下载地址（含付费墙校验）
 * @throws {{ status: number; code: number; message: string }}
 */
export async function getMaterialContent(
  materialId: string,
  userId?: number | null,
): Promise<MaterialContentResult> {
  const repo = new LearningMaterialsRepo(getPool());
  const material = await repo.findByMaterialId(materialId);
  if (!material) throw { status: 404, code: 40044, message: "学习资料不存在" };

  const payload: MaterialContentResult = {
    contentZh: material.content_zh ?? "",
    contentEn: material.content_en ?? "",
    fileUrl: material.file_url,
    fileName: material.file_name,
  };

  // 免费资料直接返回
  if (material.is_premium !== 1) return payload;

  // premium 资料：需登录 + 已购买
  if (!userId) throw { status: 401, code: 40001, message: "请先登录" };
  const purchasedIds = await repo.findPurchasedMaterialIds(userId);
  if (!purchasedIds.includes(materialId)) throw { status: 403, code: 40301, message: "请先购买后查看" };

  return payload;
}
