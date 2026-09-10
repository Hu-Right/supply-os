/**
 * 平台介绍模块 — 容器组件（编排 4 个子区块）
 * About Section — Container composing 4 sub-sections
 *
 * @module features/home/components/AboutSection
 * @description 薄容器组件，职责仅为编排子区块顺序，不含业务逻辑。
 *              子组件：AboutHero / AboutAdvantages / AboutSteps / AboutCta
 */
import { AboutHero } from "./about/AboutHero";
import { AboutAdvantages } from "./about/AboutAdvantages";
import { AboutSteps } from "./about/AboutSteps";
import { AboutCta } from "./about/AboutCta";

export function AboutSection() {
  return (
    <section className="bg-white">
      <AboutHero />
      <AboutAdvantages />
      <AboutSteps />
      <AboutCta />
    </section>
  );
}
