/**
 * 往期课堂现场区（定时自动轮播 + 数量角标，DB 驱动）
 * Gallery Section (timed auto-carousel)
 *
 * @module features/training/components/GallerySection
 * @description 桌面端 4 列 flex-wrap 网格，每张卡片定时自动轮播该分类下的照片；
 *              右上角显示照片数量角标；移动端横向滚动。无数据时不渲染。
 */

import { useEffect, useState } from "react";
import { useLocale, pickLocale } from "@/core/i18n";
import { SectionTitle } from "./SectionTitle";
import type { LandingGalleryCategory } from "../api";

const ROTATE_INTERVAL = 3000; // 定时轮播间隔 3 秒

export interface GallerySectionProps {
  gallery: LandingGalleryCategory[];
}

/** 单个分类卡片：定时自动轮播照片 */
function GalleryCard({ category }: { category: LandingGalleryCategory }) {
  const { locale } = useLocale();
  const images = category.images;
  const [index, setIndex] = useState(0);

  // 定时轮播：每 3 秒自动切换，循环播放
  useEffect(() => {
    if (images.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, ROTATE_INTERVAL);
    return () => clearInterval(timer);
  }, [images.length]);

  const title = pickLocale(locale, category.name_zh, category.name_en ?? category.name_zh);
  const desc = pickLocale(locale, category.description_zh || "", category.description_en || "");

  return (
    <div className="group relative w-[calc(50%-16px)] min-w-[260px] max-w-[360px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs md:w-[calc(25%-20px)] md:max-w-[320px]">
      <div className="relative aspect-video overflow-hidden bg-slate-100">
        <img
          src={images[index]?.image_path}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover transition-opacity duration-300"
        />
        {/* 数量角标 */}
        {images.length > 1 && (
          <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">
            {images.length} 张
          </span>
        )}
        {/* 圆点指示器 */}
        {images.length > 1 && (
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {images.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full transition-colors ${i === index ? "bg-white" : "bg-white/50"}`} />
            ))}
          </div>
        )}
      </div>
      <div className="p-3 text-center">
        <h4 className="text-sm font-black text-slate-900">{title}</h4>
        {desc && <p className="mt-1 text-xs leading-snug text-slate-500">{desc}</p>}
      </div>
    </div>
  );
}

export function GallerySection({ gallery }: GallerySectionProps) {
  const { t } = useLocale();
  const withImages = gallery.filter((g) => g.images.length > 0);
  if (withImages.length === 0) return null;

  return (
    <section className="py-4">
      <SectionTitle title={t("tlGalleryTitle")} />

      {/* 桌面/平板：flex-wrap 网格（定时轮播） */}
      <div className="hidden sm:flex sm:flex-wrap sm:justify-center gap-4 md:gap-5">
        {withImages.map((cat) => (
          <GalleryCard key={cat.id} category={cat} />
        ))}
      </div>

      {/* 移动端：横向滚动 */}
      <div className="relative sm:hidden">
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-slate-50 to-transparent" />
        <div className="scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2">
          {withImages.map((cat) => (
            <div key={cat.id} className="w-[280px] shrink-0 snap-center">
              <GalleryCard category={cat} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

GallerySection.displayName = "GallerySection";
