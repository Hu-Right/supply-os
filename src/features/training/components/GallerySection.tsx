/**
 * 往期课堂现场（设计图 1:1 四卡片；多图分类保留 3 秒定时轮播）
 * Gallery section v2
 *
 * @module features/training/components/GallerySection
 * @description 分类来自 DB；无图片时显示占位视觉。
 */
import { useEffect, useState } from "react";
import { Presentation } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { SectionTitle } from "./landing-ui";
import type { LandingGalleryCategory } from "../api";

const ROTATE_INTERVAL = 3000;

function GalleryCard({ cat }: { cat: LandingGalleryCategory }) {
  const { locale } = useLocale();
  const [idx, setIdx] = useState(0);
  const images = cat.images;

  // 多于 1 张时定时轮播（沿用既定交互）
  useEffect(() => {
    if (images.length <= 1) return;
    const timer = setInterval(() => setIdx((i) => (i + 1) % images.length), ROTATE_INTERVAL);
    return () => clearInterval(timer);
  }, [images.length]);

  const current = images[idx];

  return (
    <div className="rounded-lg border border-[#E5EBF3] bg-white overflow-hidden shadow-[0_4px_16px_rgba(10,42,85,0.06)]">
      <div className="relative h-40 bg-[#0A2A55]">
        {current ? (
          <img src={current.image_path} alt={pickLocale(locale, cat.name_zh, cat.name_en ?? cat.name_zh)} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0A2A55] to-[#11437E]">
            <Presentation className="w-10 h-10 text-white/40" />
          </div>
        )}
        {images.length > 1 && (
          <span className="absolute right-2 bottom-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white">
            {idx + 1} / {images.length}
          </span>
        )}
      </div>
      <div className="p-4 text-center">
        <h3 className="text-sm font-black text-[#0A2A55]">{pickLocale(locale, cat.name_zh, cat.name_en ?? cat.name_zh)}</h3>
        <p className="mt-1.5 text-xs text-slate-600">{pickLocale(locale, cat.description_zh || "", cat.description_en)}</p>
      </div>
    </div>
  );
}

export function GallerySection({ gallery }: { gallery: LandingGalleryCategory[] }) {
  const { t } = useLocale();
  if (gallery.length === 0) return null;

  return (
    <section className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <SectionTitle title={t("tlGalTitle")} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {gallery.map((cat) => <GalleryCard key={cat.id} cat={cat} />)}
        </div>
      </div>
    </section>
  );
}
