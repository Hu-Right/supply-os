/**
 * 往期课堂现场（设计图 1:1 三卡片；多图分类保留 3 秒定时轮播）
 * Gallery section v3
 *
 * @module features/training/components/GallerySection
 * @description 分类文案走 i18n（六语言 training.json 的 tlGalCat* key），
 *              图片路径为前端静态配置（src/data/training-content.ts，文件在
 *              public/images/training/gallery/ 下），不再查库；无图片时显示占位视觉。
 *              交互增强：鼠标悬停暂停轮播，点击图片打开**近全屏**预览（黑底、原图 contain），
 *              支持左右切换、缩略图直达与 Esc 关闭。
 */
import { useEffect, useState, useCallback } from "react";
import { Presentation, ChevronLeft, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import { useLocale, type LocaleKey } from "@/core/i18n";
import { SectionTitle } from "./landing-ui";
import { TRAINING_GALLERY_CATEGORIES } from "../constants";

const ROTATE_INTERVAL = 3000;

function GalleryCard({ nameKey, descKey, images }: {
  nameKey: LocaleKey;
  descKey: LocaleKey;
  images: string[];
}) {
  const { t } = useLocale();
  const [idx, setIdx] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  // 多于 1 张时定时轮播，鼠标悬停时暂停
  useEffect(() => {
    if (images.length <= 1 || isHovered) return;
    const timer = setInterval(() => setIdx((i) => (i + 1) % images.length), ROTATE_INTERVAL);
    return () => clearInterval(timer);
  }, [images.length, isHovered]);

  const current = images[idx];
  const name = t(nameKey);
  const description = t(descKey);

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

  // 预览打开时：Esc 关闭 + 锁定背景滚动
  useEffect(() => {
    if (previewIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewIdx(null);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [previewIdx]);

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
              src={current}
              alt={name}
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
            <span className="absolute right-2 bottom-2 rounded-full bg-black/50 px-2 py-0.5 text-2xs font-bold text-white">
              {idx + 1} / {images.length}
            </span>
          )}
        </div>
        <div className="p-4 text-center">
          <h3 className="text-sm font-black text-training-navy">{name}</h3>
          <p className="mt-1.5 text-xs text-slate-600">{description}</p>
        </div>
      </div>

      {/* 近全屏预览：黑底铺满视口，图片 contain 居中，底部缩略图直达 */}
      {previewIdx !== null && images[previewIdx] && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={name}
        >
          <button
            type="button"
            onClick={handleClosePreview}
            aria-label={t("uiClose")}
            className="absolute end-4 top-4 z-20 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/25"
          >
            <X className="h-6 w-6" />
          </button>

          {/* 图片区域：占满剩余高度 */}
          <div className="relative min-h-0 flex-1">
            <Image
              src={images[previewIdx]}
              alt={name}
              fill
              sizes="100vw"
              quality={85}
              className="object-contain"
            />

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrev}
                  aria-label={t("galleryPrev")}
                  className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white transition-colors hover:bg-black/75 md:left-6"
                >
                  <ChevronLeft className="h-8 w-8" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  aria-label={t("galleryNext")}
                  className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white transition-colors hover:bg-black/75 md:right-6"
                >
                  <ChevronRight className="h-8 w-8" />
                </button>
              </>
            )}
          </div>

          {/* 底部：标题 + 计数 + 缩略图条 */}
          <div className="shrink-0 bg-black/40 px-3 pb-3 pt-2 sm:px-5">
            <div className="mb-2 flex items-center justify-between text-white">
              <p className="text-sm font-bold">{name}</p>
              {images.length > 1 && (
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
                  {previewIdx + 1} / {images.length}
                </span>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    type="button"
                    onClick={() => setPreviewIdx(i)}
                    aria-label={`${name} ${i + 1}`}
                    aria-current={i === previewIdx ? "true" : undefined}
                    className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 transition-opacity ${
                      i === previewIdx
                        ? "border-training-green opacity-100"
                        : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    <Image src={src} alt="" fill sizes="80px" className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function GallerySection() {
  const { t } = useLocale();

  return (
    <section className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <SectionTitle title={t("tlGalTitle")} />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
          {TRAINING_GALLERY_CATEGORIES.map((cat) => (
            <GalleryCard
              key={cat.id}
              nameKey={cat.nameKey}
              descKey={cat.descKey}
              images={cat.images}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
