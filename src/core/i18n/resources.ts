/**
 * 各语言翻译资源——纯类型导出（仅供 LocaleKey 类型推导）
 * Type-only Locale Resources (for LocaleKey type derivation only)
 *
 * @module core/i18n/resources
 * @description 所有 import/export 均为 type-only，编译后完全擦除，
 *              不产生任何运行时代码。JSON 文件由 loader.ts 动态按需加载。
 *              All imports/exports are type-only — erased at compile time.
 *              JSON files are loaded on-demand via loader.ts dynamic imports.
 */

import type zhCommon from "./locales/zh/common.json";
import type zhProcurement from "./locales/zh/procurement.json";
import type zhAuth from "./locales/zh/auth.json";
import type zhPayment from "./locales/zh/payment.json";
import type zhMembership from "./locales/zh/membership.json";
import type zhCrm from "./locales/zh/crm.json";
import type zhSupplier from "./locales/zh/supplier.json";
import type zhShowroom from "./locales/zh/showroom.json";
import type zhServices from "./locales/zh/services.json";
import type zhLearning from "./locales/zh/learning.json";

type Merge<T> = { [K in keyof T]: T[K] };

export type zh = Merge<
  typeof zhCommon &
  typeof zhProcurement &
  typeof zhAuth &
  typeof zhPayment &
  typeof zhMembership &
  typeof zhCrm &
  typeof zhSupplier &
  typeof zhShowroom &
  typeof zhServices &
  typeof zhLearning
>;
