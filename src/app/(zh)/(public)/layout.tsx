/**
 * (public)/layout.tsx — 公开内容布局框架
 */
import type { ReactNode } from "react";
import LayoutShell from "./layout-shell";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <LayoutShell>{children}</LayoutShell>;
}
