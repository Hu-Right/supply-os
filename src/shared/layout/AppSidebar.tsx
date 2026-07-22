/**
 * 移动端侧边菜单
 * App Sidebar Component
 *
 * @module shared/layout/AppSidebar
 * @description 移动端抽屉式菜单
 *              Mobile drawer menu
 */

import { type ReactNode, useEffect } from "react";
import { X } from "lucide-react";

export interface AppSidebarProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 菜单内容 */
  children: ReactNode;
}

export function AppSidebar({ open, onClose, children }: AppSidebarProps) {
  // Escape 关闭
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // 阻止背景滚动
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* 遮罩 */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-white shadow-xl transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
          <span className="text-sm font-bold text-slate-900">菜单</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭菜单"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="overflow-y-auto p-4">{children}</nav>
      </aside>
    </>
  );
}

AppSidebar.displayName = "AppSidebar";
