"use client";

/**
 * 醒目拖拽上传区（市面通用形态：拖拽 + 点击 + 预览列表 + 状态）
 * @module features/procurement-demand/FileDropzone
 *
 * @description 采购发布域通用上传组件：拖拽/点击双通道，接受类型与大小校验，
 *              文件清单带类型图标/大小/删除，支持已有文件回显（已上传列表）。
 *              上传动作由父组件执行（本组件只管「选什么文件」），保证同一组件
 *              适配执照/需求附件/授权扫描件三种场景。
 */
import { useCallback, useRef, useState } from "react";
import { useLocale } from "@/core/i18n";

export interface ExistingFile {
  name: string;
  url: string;
  sizeBytes?: number;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
}

function typeIcon(name: string): string {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "🖼️";
  if (ext === "pdf") return "📕";
  if (["doc", "docx"].includes(ext)) return "📘";
  if (["xls", "xlsx"].includes(ext)) return "📊";
  if (ext === "zip") return "🗜️";
  return "📄";
}

export interface FileDropzoneProps {
  /** 接受的 MIME/扩展名（input accept 原样） */
  accept: string;
  /** 单文件大小上限（字节） */
  maxSizeBytes: number;
  /** 多选 */
  multiple?: boolean;
  /** 受控文件清单（父组件持有） */
  files: File[];
  onFilesChange: (files: File[]) => void;
  /** 已上传文件的回显（服务器侧） */
  existingFiles?: ExistingFile[];
  onRemoveExisting?: (name: string) => void;
  /** 错误回调（超限/类型不符） */
  onReject?: (reason: "type" | "size") => void;
  /** 紧凑形态（授权页等窄容器） */
  compact?: boolean;
}

export function FileDropzone(props: FileDropzoneProps) {
  const { t } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { files, onFilesChange, existingFiles = [], accept, maxSizeBytes, multiple = false } = props;

  const validate = useCallback(
    (incoming: File[]): File[] | null => {
      const accepted: File[] = [];
      for (const f of incoming) {
        const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".") + 1).toLowerCase() : "";
        const allowed = accept.split(",").map((s) => s.trim().toLowerCase()).some((a) => a === `.${ext}` || a === f.type);
        if (!allowed) {
          props.onReject?.("type");
          return null;
        }
        if (f.size > maxSizeBytes) {
          props.onReject?.("size");
          return null;
        }
        accepted.push(f);
      }
      return accepted;
    },
    [accept, maxSizeBytes, props],
  );

  const addFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming || incoming.length === 0) return;
      const ok = validate(Array.from(incoming));
      if (!ok) return;
      onFilesChange(multiple ? [...files, ...ok] : [ok[0]]);
    },
    [files, multiple, onFilesChange, validate],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  return (
    <div>
      {/* 拖拽区：醒目虚线框 + 大图标 + 双通道提示 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-6 text-center transition-colors ${
          props.compact ? "py-5" : "py-8"
        } ${dragging ? "border-teal-500 bg-teal-50" : "border-secondary-300 bg-secondary-50/60 hover:border-teal-400 hover:bg-teal-50/40"}`}
      >
        <div className="text-3xl">{dragging ? "📥" : "📁"}</div>
        <div className="mt-2 text-sm font-bold text-secondary-800">
          {dragging ? t("pc_fz_drop_now") : t("pc_fz_drop")}
        </div>
        <div className="mt-1 text-xs text-secondary-400">
          {t("pc_fz_or_browse")} · {t("pc_fz_max")} {Math.round(maxSizeBytes / 1024 / 1024)}MB
        </div>
        <div className="mt-2 inline-block rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white">
          {t("pc_fz_browse")}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {/* 待上传清单 */}
      {files.length > 0 && (
        <div className="mt-3 grid gap-2">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50/50 px-3 py-2">
              <span className="text-lg">{typeIcon(f.name)}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-secondary-800">{f.name}</span>
              <span className="text-xs text-secondary-400">{fmtSize(f.size)}</span>
              <button
                type="button"
                onClick={() => onFilesChange(files.filter((_, idx) => idx !== i))}
                className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
              >
                {t("pc_fz_remove")}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 已上传回显 */}
      {existingFiles.length > 0 && (
        <div className="mt-2 grid gap-2">
          {existingFiles.map((f) => (
            <div key={f.name} className="flex items-center gap-3 rounded-lg border border-secondary-200 bg-white px-3 py-2">
              <span className="text-lg">{typeIcon(f.name)}</span>
              <a href={f.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-teal-700 underline">
                {f.name}
              </a>
              {f.sizeBytes != null && <span className="text-xs text-secondary-400">{fmtSize(f.sizeBytes)}</span>}
              {props.onRemoveExisting && (
                <button
                  type="button"
                  onClick={() => props.onRemoveExisting?.(f.name)}
                  className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                >
                  {t("pc_fz_remove")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
