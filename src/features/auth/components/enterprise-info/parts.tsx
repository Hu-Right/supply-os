"use client";

/**
 * 企业信息卡 — 状态屏与表格展示件（自 EnterpriseInfoCard.tsx 拆出，JSX 逐字不变）。
 *
 * 全部展示组件（React.memo）：判定/取数留在容器。
 *
 * @module features/auth/components/enterprise-info/parts
 */
import { memo } from "react";
import { Building2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { AuthLicenseImage, Skeleton } from "@/shared/ui";
import type { Cell } from "./formatters";

const btnBlue = "px-4 py-1.5 rounded-md bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors shrink-0";
const btnPlain = "px-4 py-1.5 rounded-md bg-white border border-border text-xs font-medium text-foreground hover:bg-secondary-50 transition-colors shrink-0";

/** 分组标题（左侧色条） */
export const GroupTitle = memo(function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-1 h-4 rounded bg-brand-500" />
      <h3 className="text-sm font-medium text-foreground">{children}</h3>
    </div>
  );
});

/** 分组表格：将 cells 打包为每行 2 组（full 通栏独占一行） */
export const InfoTable = memo(function InfoTable({ cells }: { cells: Cell[] }) {
  const rows: Cell[][] = [];
  let cur: Cell[] = [];
  for (const c of cells) {
    if (c.full) {
      if (cur.length) { rows.push(cur); cur = []; }
      rows.push([c]);
    } else {
      cur.push(c);
      if (cur.length === 2) { rows.push(cur); cur = []; }
    }
  }
  if (cur.length) rows.push(cur);

  return (
    <div className="border border-border rounded-md overflow-hidden bg-white">
      {rows.map((row, ri) => (
        <div key={ri} className="grid grid-cols-4 border-b border-border last:border-b-0">
          {row.map((cell, ci) => (
            <div key={ci} className={`contents`}>
              <div className="bg-secondary-50 px-3 py-2 text-xs text-muted-foreground border-r border-border">
                {cell.label}
              </div>
              <div
                className={`px-3 py-2 text-xs text-foreground break-words ${cell.full ? "col-span-3" : "col-span-1"} ${ci === 0 ? "" : "border-l border-border"}`}
              >
                {cell.value}
              </div>
            </div>
          ))}
          {/* 单 cell 行补齐空位保持 4 列对齐 */}
          {row.length === 1 && !row[0].full && (
            <>
              <div className="bg-secondary-50 px-3 py-2 border-r border-border" />
              <div className="px-3 py-2" />
            </>
          )}
        </div>
      ))}
    </div>
  );
});

/** 加载中骨架屏 */
export const LoadingState = memo(function LoadingState() {
  return (
    <div className="bg-secondary-50 border border-border rounded-lg px-6 py-5" aria-busy="true">
      <Skeleton variant="text" className="h-4 w-1/4 mb-3" />
      <Skeleton variant="rectangular" className="h-24" />
    </div>
  );
});

/** 加载失败：错误 + 重试（不得伪装成未绑定引导） */
export const ErrorState = memo(function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useLocale();
  return (
    <div className="bg-secondary-50 border border-border rounded-lg px-6 py-5 flex items-center gap-4">
      <span className="w-10 h-10 rounded-full bg-secondary-200 text-secondary-500 flex items-center justify-center shrink-0">
        <Building2 className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{t("authEnterpriseTitle") || "企业信息"}</p>
        <p className="text-xs text-danger-600 mt-1">{t("authEnterpriseLoadError") || "企业信息加载失败"}</p>
      </div>
      <button type="button" onClick={onRetry} className={btnPlain}>
        {t("authEnterpriseRetry") || "重试"}
      </button>
    </div>
  );
});

/** 未绑定：引导 + 立即绑定 */
export const NotBoundState = memo(function NotBoundState({ onBind }: { onBind: () => void }) {
  const { t } = useLocale();
  return (
    <div className="bg-secondary-50 border border-border rounded-lg px-6 py-5 flex items-center gap-4">
      <span className="w-10 h-10 rounded-full bg-secondary-200 text-secondary-500 flex items-center justify-center shrink-0">
        <Building2 className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{t("authEnterpriseTitle") || "企业信息"}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {t("authEnterpriseNotBoundDesc") || "绑定企业后即可展示企业信息并参与国际采购撮合"}
        </p>
      </div>
      <button type="button" onClick={onBind} className={btnBlue}>
        {t("authEnterpriseBindNow") || "立即绑定"}
      </button>
    </div>
  );
});

/** 营业执照展示格 */
export const LicenseView = memo(function LicenseView({ licenseUrl }: { licenseUrl: string }) {
  return (
    <div className="border border-border rounded-md overflow-hidden bg-white p-4">
      {licenseUrl ? (
        <div className="flex items-center gap-4">
          <div className="w-40 h-28 rounded border border-border overflow-hidden bg-secondary-50 flex items-center justify-center">
            <AuthLicenseImage url={licenseUrl} alt="营业执照" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-success-600 font-medium">营业执照已上传</p>
            <p className="text-xs text-muted-foreground mt-1">点击图片可查看大图</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-40 h-28 rounded border border-dashed border-border bg-secondary-50 flex items-center justify-center">
            <span className="text-xs text-muted-foreground">暂无</span>
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">尚未上传营业执照</p>
          </div>
        </div>
      )}
    </div>
  );
});
