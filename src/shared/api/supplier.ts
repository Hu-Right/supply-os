/**
 * 供应商公共 API（跨 feature 共享）
 * Supplier Shared API
 *
 * @module shared/api/supplier
 * @description 被 supplier 与 supplier-profile 共同消费的 API 调用与类型定义。
 *              从 features/supplier/api.ts 提升至 shared 层以消除跨 feature 硬依赖。
 */

import type { Supplier } from "@/types";
import { api } from "@/core/http";

/**
 * 供应商明文联系方式
 * Plaintext supplier contact info
 */
export type SupplierContact = {
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
};

/** 供应商联系方式弹窗状态 */
export type SupplierContactStatus = "vipOnly" | "loading" | "success" | "error";

/** 详情页公开成绩单——单维度概览条目（只有名称/得分/该维度满分，无原始分/证据/作答） */
export interface SupplierScorecardDimension {
  name: string;
  score: number;
  /** 该维度满分（权重），条宽 = score/max */
  max: number;
}

/**
 * 投标能力成绩单（详情页公开面）
 * 只认「归属人提交」的诊断报告（服务端取数侧保证）；维度明细/短板/作答不在此面，
 * 归属人看全文走 /api/supplier-diagnosis/mine。
 */
export interface SupplierScorecard {
  totalScore: number;
  grade: "A" | "B" | "C";
  gradeLabel: string;
  evaluatedAt: string;
  dimensions: SupplierScorecardDimension[];
}

/**
 * 查询单条供应商详情
 * Fetch single supplier by ID
 */
export async function fetchSupplierById(lang: string, id: string): Promise<Supplier> {
  return api<Supplier>(`/api/suppliers/${encodeURIComponent(id)}?lang=${encodeURIComponent(lang)}`);
}

/**
 * 查询供应商明文联系方式（VIP 专属，403 抛 VIP_REQUIRED）
 * Fetch plaintext supplier contact (VIP only)
 */
export async function fetchSupplierContact(id: string): Promise<SupplierContact> {
  return api<SupplierContact>(`/api/suppliers/${encodeURIComponent(id)}/contact`);
}
