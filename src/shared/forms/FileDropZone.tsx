/**
 * 文件拖拽上传区组件
 * File Drop Zone Component
 *
 * @module shared/forms/FileDropZone
 * @description 拖拽上传区（仿真）
 *              Drag and drop upload area (simulated)
 */

import { useCallback, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";

export interface FileDropZoneProps {
  /** 文件变更回调 */
  onFilesChange?: (files: File[]) => void;
  /** 接受的文件类型 */
  accept?: string;
  /** 是否多选 */
  multiple?: boolean;
  /** 提示文本 */
  placeholder?: string;
  /** 自定义类名 */
  className?: string;
}

export function FileDropZone({
  onFilesChange,
  accept,
  multiple = false,
  placeholder = "拖拽文件到此处，或点击选择",
  className = "",
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      onFilesChange?.(files);
    },
    [onFilesChange],
  );

  const handleClick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => {
      const files = Array.from(input.files || []);
      onFilesChange?.(files);
    };
    input.click();
  }, [accept, multiple, onFilesChange]);

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        isDragging
          ? "border-teal-500 bg-teal-50"
          : "border-slate-300 bg-slate-50 hover:border-slate-400"
      } ${className}`}
      role="button"
      tabIndex={0}
      aria-label="文件上传区域"
    >
      <Upload
        className={`mb-2 h-8 w-8 ${isDragging ? "text-teal-600" : "text-slate-400"}`}
      />
      <p className="text-sm text-slate-600">{placeholder}</p>
    </div>
  );
}

FileDropZone.displayName = "FileDropZone";
