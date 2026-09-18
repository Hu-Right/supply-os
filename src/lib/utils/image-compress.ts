/**
 * 图片压缩工具
 * Image Compression Utility
 *
 * @module lib/utils/image-compress
 * @description 客户端 Canvas 压缩，减少上传体积和存储成本。
 *              支持 JPEG/PNG/WebP，自动降采样 + 质量压缩。
 */

export interface CompressOptions {
  /** 最大宽度（默认 2560） */
  maxWidth?: number;
  /** 最大高度（默认 2560） */
  maxHeight?: number;
  /** JPEG/WebP 质量（0-1，默认 0.9） */
  quality?: number;
  /** 目标格式（默认保持原格式，可强制转为 image/jpeg） */
  targetType?: "image/jpeg" | "image/png" | "image/webp";
}

/**
 * 压缩图片文件
 * @param file - 原始图片文件
 * @param options - 压缩选项
 * @returns 压缩后的 Blob
 */
export async function compressImage(file: File, options: CompressOptions = {}): Promise<Blob> {
  const {
    maxWidth = 2560,
    maxHeight = 2560,
    quality = 0.9,
    targetType,
  } = options;

  // 小文件不压缩（< 500KB 直接返回）
  if (file.size < 500 * 1024) {
    return file;
  }

  const img = new Image();
  const url = URL.createObjectURL(file);

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("图片加载失败"));
      img.src = url;
    });

    // 计算缩放比例
    let { width, height } = img;
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);
    }

    // Canvas 绘制
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 上下文创建失败");

    // 白色背景（JPEG 不支持透明）
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    // 确定输出格式
    const outputType = targetType || file.type || "image/jpeg";
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("压缩失败"))),
        outputType,
        quality,
      );
    });

    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 将 Blob 转为 File（保留原文件名）
 */
export function blobToFile(blob: Blob, originalName: string): File {
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const name = originalName.replace(/\.\w+$/, `.${ext}`);
  return new File([blob], name, { type: blob.type });
}
