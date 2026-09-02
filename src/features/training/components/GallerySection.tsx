/**
 * 往期课堂现场（设计图 1:1 四卡片；多图分类保留 3 秒定时轮播）
 * Gallery section v2
 *
 * @module features/training/components/GallerySection
 * @description 分类来自 DB；无图片时显示占位视觉。
 *              交互增强：鼠标悬停暂停轮播，点击图片打开全屏预览。
 */
import { useEffect, useState, useCallback } from "react";
import { Presentation, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useLocale, pickLocale } from "@/core/i18n";
import { SectionTitle } from "./landing-ui";
import { Modal, Button } from "@/shared/ui";
import type { LandingGalleryCategory } from "../api";

const ROTATE_INTERVAL = 3000;

function GalleryCard({ cat }: { cat: LandingGalleryCategory }) {
  const { locale, t } = useLocale();
  const [idx, setIdx] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const images = cat.images;

  // 多于 1 张时定时轮播，鼠标悬停时暂停
  useEffect(() => {
    if (images.length <= 1 || isHovered) return;
    const timer = setInterval(() => setIdx((i) => (i + 1) % images.length), ROTATE_INTERVAL);
    return () => clearInterval(timer);
  }, [images.length, isHovered]);

  const current = images[idx];

  const handleImageClick = useCallback(() => {
    setPreviewIdx(idx);
  }, [idx]);

  const handleClosePreview = useCallback(() => {
    setPreviewIdx(null);
  }, []);

  const handlePrev = useCallback(() => {
    setPreviewIdx((prev) => {
      if (prev === null) return null;
      return (prev - 1 + images.length) % images.length;
    });
  }, [images.length]);

  const handleNext = useCallback(() => {
    setPreviewIdx((prev) => {
      if (prev === null) return null;
      return (prev + 1) % images.length;
    });
  }, [images.length]);

  return (
    <>
      <div
        className="rounded-lg border border-training-border bg-white overflow-hidden shadow-card-soft"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="relative h-40 bg-training-navy cursor-pointer" onClick={handleImageClick}>
          {current ? (
            <Image
              src={current.image_path}
              alt={pickLocale(locale, cat.name_zh, cat.name_en ?? cat.name_zh)}
              fill
              sizes="300px"
              quality={80}
              className="object-cover transition-transform duration-300 hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-training-navy to-[#11437E]">
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
          <h3 className="text-sm font-black text-training-navy">{pickLocale(locale, cat.name_zh, cat.name_en ?? cat.name_zh)}</h3>
          <p className="mt-1.5 text-xs text-slate-600">{pickLocale(locale, cat.description_zh || "", cat.description_en)}</p>
        </div>
      </div>

      {/* 全屏预览弹窗 */}
      <Modal
        open={previewIdx !== null}
        onClose={handleClosePreview}
        showClose={true}
        closeOnBackdrop={true}
        closeOnEsc={true}
        closeOnDrag={false}
        className="max-w-none w-full sm:w-[95vw] h-[90vh] p-2"
      >
        {previewIdx !== null && images[previewIdx] && (
          <div className="relative h-full flex flex-col">
            {/* 图片区域 */}
            <div className="relative flex-1 flex items-center justify-center overflow-hidden">
              <Image
                src={images[previewIdx].image_path}
                alt={pickLocale(locale, cat.name_zh, cat.name_en ?? cat.name_zh)}
                width={1200}
                height={800}
                quality={85}
                className="max-w-full max-h-full object-contain"
              />

              {/* 左右切换按钮 */}
              {images.length > 1 && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handlePrev}
                    className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white hover:bg-black/70 cursor-pointer shadow-lg"
                    aria-label={t("galleryPrev")}
                  >
                    <ChevronLeft className="w-8 h-8" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleNext}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white hover:bg-black/70 cursor-pointer shadow-lg"
                    aria-label={t("galleryNext")}
                  >
                    <ChevronRight className="w-8 h-8" />
                  </Button>
                </>
              )}
            </div>

            {/* 底部信息 */}
            <div className="mt-2 flex items-center justify-between px-2">
              <p className="text-base font-bold text-training-navy">
                {pickLocale(locale, cat.name_zh, cat.name_en ?? cat.name_zh)}
              </p>
              {images.length > 1 && (
                <span className="rounded-full bg-slate-100 px-4 py-1.5 text-sm font-bold text-slate-600">
                  {previewIdx + 1} / {images.length}
                </span>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
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
