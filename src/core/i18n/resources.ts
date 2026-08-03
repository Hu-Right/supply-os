/**
 * 各语言翻译资源合并模块
 * Merged Locale Resources (feature-split JSON -> single resource per language)
 *
 * @module core/i18n/resources
 * @description locales/<lang>/ 下按 feature 拆分的 JSON 在此按语言 spread 合并，
 *              供 react-i18next resources 与 LocaleKey 类型推导使用。
 *              key 名称与拆分前完全一致，消费方无感知。
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

export const zh = { ...zhCommon, ...zhProcurement, ...zhAuth, ...zhPayment, ...zhMembership, ...zhCrm, ...zhSupplier, ...zhShowroom, ...zhServices, ...zhLearning };
export const en = { ...enCommon, ...enProcurement, ...enAuth, ...enPayment, ...enMembership, ...enCrm, ...enSupplier, ...enShowroom, ...enServices, ...enLearning };
export const fr = { ...frCommon, ...frProcurement, ...frAuth, ...frPayment, ...frMembership, ...frCrm, ...frSupplier, ...frShowroom, ...frServices, ...frLearning };
export const ru = { ...ruCommon, ...ruProcurement, ...ruAuth, ...ruPayment, ...ruMembership, ...ruCrm, ...ruSupplier, ...ruShowroom, ...ruServices, ...ruLearning };
export const es = { ...esCommon, ...esProcurement, ...esAuth, ...esPayment, ...esMembership, ...esCrm, ...esSupplier, ...esShowroom, ...esServices, ...esLearning };
export const ar = { ...arCommon, ...arProcurement, ...arAuth, ...arPayment, ...arMembership, ...arCrm, ...arSupplier, ...arShowroom, ...arServices, ...arLearning };
