/**
 * 客户端翻译包（静态 import，消除首屏异步加载白屏）
 *
 * @module core/i18n/client-bundles
 * @description 与 bundles.ts 结构完全一致，但在客户端静态 import。
 *              Next.js/Turbopack 会将每种语言打包为独立 chunk，
 *              6 种语言总计 ~45KB（gzip ~12KB），可接受。
 *              消除 init({ resources: {} }) + 动态 import 异步链，
 *              i18next 实例创建时即拥有全部翻译资源，无需 null 门等待。
 */

import zhCommon from "./locales/zh/common.json";
import zhProcurement from "./locales/zh/procurement.json";
import zhAuth from "./locales/zh/auth.json";
import zhPayment from "./locales/zh/payment.json";
import zhMembership from "./locales/zh/membership.json";
import zhCrm from "./locales/zh/crm.json";
import zhSupplier from "./locales/zh/supplier.json";
import zhShowroom from "./locales/zh/showroom.json";
import zhServices from "./locales/zh/services.json";
import zhLearning from "./locales/zh/learning.json";
import zhTraining from "./locales/zh/training.json";

import enCommon from "./locales/en/common.json";
import enProcurement from "./locales/en/procurement.json";
import enAuth from "./locales/en/auth.json";
import enPayment from "./locales/en/payment.json";
import enMembership from "./locales/en/membership.json";
import enCrm from "./locales/en/crm.json";
import enSupplier from "./locales/en/supplier.json";
import enShowroom from "./locales/en/showroom.json";
import enServices from "./locales/en/services.json";
import enLearning from "./locales/en/learning.json";
import enTraining from "./locales/en/training.json";

import frCommon from "./locales/fr/common.json";
import frProcurement from "./locales/fr/procurement.json";
import frAuth from "./locales/fr/auth.json";
import frPayment from "./locales/fr/payment.json";
import frMembership from "./locales/fr/membership.json";
import frCrm from "./locales/fr/crm.json";
import frSupplier from "./locales/fr/supplier.json";
import frShowroom from "./locales/fr/showroom.json";
import frServices from "./locales/fr/services.json";
import frLearning from "./locales/fr/learning.json";
import frTraining from "./locales/fr/training.json";

import ruCommon from "./locales/ru/common.json";
import ruProcurement from "./locales/ru/procurement.json";
import ruAuth from "./locales/ru/auth.json";
import ruPayment from "./locales/ru/payment.json";
import ruMembership from "./locales/ru/membership.json";
import ruCrm from "./locales/ru/crm.json";
import ruSupplier from "./locales/ru/supplier.json";
import ruShowroom from "./locales/ru/showroom.json";
import ruServices from "./locales/ru/services.json";
import ruLearning from "./locales/ru/learning.json";
import ruTraining from "./locales/ru/training.json";

import esCommon from "./locales/es/common.json";
import esProcurement from "./locales/es/procurement.json";
import esAuth from "./locales/es/auth.json";
import esPayment from "./locales/es/payment.json";
import esMembership from "./locales/es/membership.json";
import esCrm from "./locales/es/crm.json";
import esSupplier from "./locales/es/supplier.json";
import esShowroom from "./locales/es/showroom.json";
import esServices from "./locales/es/services.json";
import esLearning from "./locales/es/learning.json";
import esTraining from "./locales/es/training.json";

import arCommon from "./locales/ar/common.json";
import arProcurement from "./locales/ar/procurement.json";
import arAuth from "./locales/ar/auth.json";
import arPayment from "./locales/ar/payment.json";
import arMembership from "./locales/ar/membership.json";
import arCrm from "./locales/ar/crm.json";
import arSupplier from "./locales/ar/supplier.json";
import arShowroom from "./locales/ar/showroom.json";
import arServices from "./locales/ar/services.json";
import arLearning from "./locales/ar/learning.json";
import arTraining from "./locales/ar/training.json";

const merge = (...modules: Record<string, unknown>[]): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const m of modules) {
    if (typeof m === "object" && m !== null && "default" in m) {
      Object.assign(result, (m as { default: Record<string, string> }).default);
    } else {
      Object.assign(result, m);
    }
  }
  return result;
};

/** 客户端 i18next resources 格式（与 SERVER_BUNDLES 形状一致） */
export const CLIENT_RESOURCES: Record<string, { translation: Record<string, string> }> = {
  zh: { translation: merge(zhCommon, zhProcurement, zhAuth, zhPayment, zhMembership, zhCrm, zhSupplier, zhShowroom, zhServices, zhLearning, zhTraining) },
  en: { translation: merge(enCommon, enProcurement, enAuth, enPayment, enMembership, enCrm, enSupplier, enShowroom, enServices, enLearning, enTraining) },
  fr: { translation: merge(frCommon, frProcurement, frAuth, frPayment, frMembership, frCrm, frSupplier, frShowroom, frServices, frLearning, frTraining) },
  ru: { translation: merge(ruCommon, ruProcurement, ruAuth, ruPayment, ruMembership, ruCrm, ruSupplier, ruShowroom, ruServices, ruLearning, ruTraining) },
  es: { translation: merge(esCommon, esProcurement, esAuth, esPayment, esMembership, esCrm, esSupplier, esShowroom, esServices, esLearning, esTraining) },
  ar: { translation: merge(arCommon, arProcurement, arAuth, arPayment, arMembership, arCrm, arSupplier, arShowroom, arServices, arLearning, arTraining) },
};
