/**
 * 服务生态数据类型
 * Services Ecosystem Data Types
 *
 * @module features/services/types
 * @description 服务项、成功案例等数据结构
 *              Service item, success story data structures
 */

import type { LucideIcon } from "lucide-react";

/**
 * 服务项
 * Service Item
 */
export interface ServiceItem {
  title: string;
  desc: string;
  icon: LucideIcon;
  specs: string[];
  active?: boolean;
}

/**
 * 成功案例
 * Success Story
 */
export interface SuccessStoryItem {
  date: string;
  title: string;
  description: string;
}
