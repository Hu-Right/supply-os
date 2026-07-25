/**
 * i18next 类型增强：声明 defaultNS 与 returnNull 行为，
 * 使 useTranslation().t() 返回值类型更精确。
 *
 * 注意：不绑定 resources 到 zh.json，避免 t() 重载歧义。
 * 编译期 key 校验由门面 t(key: LocaleKey) 承担。
 */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    returnNull: false;
  }
}
