/**
 * 第三方服务生态 — 页头 Hero
 * Ecosystem Hero
 *
 * @module features/ecosystem/components/EcosystemHero
 * @description 与 ServicesHero 共用 HeroPanel，保持同一套深色渐变与装饰语言。
 */

import { useLocale } from "@/core/i18n";
import { HeroPanel } from "@/shared/ui";

export function EcosystemHero() {
  const { t } = useLocale();
  return (
    <HeroPanel title={t("svcEcoTitle")} badge={t("svcEcoBadge")} description={t("svcEcoDesc")} />
  );
}

EcosystemHero.displayName = "EcosystemHero";
