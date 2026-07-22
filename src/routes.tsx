import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Spinner, ErrorBoundary } from "@/shared/ui";
import { ProtectedRoute } from "@/shared/layout";

// Lazy load feature modules for code splitting
const ShowroomPage = lazy(() => import("@/features/showroom").then(m => ({ default: m.ShowroomPage })));
const ProcurementPage = lazy(() => import("@/features/procurement").then(m => ({ default: m.ProcurementPage })));
const SupplierPage = lazy(() => import("@/features/supplier").then(m => ({ default: m.SupplierPage })));
const CrmPage = lazy(() => import("@/features/crm").then(m => ({ default: m.CrmPage })));
const ServicesPage = lazy(() => import("@/features/services").then(m => ({ default: m.ServicesPage })));
const LearningPage = lazy(() => import("@/features/learning").then(m => ({ default: m.LearningPage })));
const MembershipPage = lazy(() => import("@/features/membership").then(m => ({ default: m.MembershipPage })));
const TrainingPage = lazy(() => import("@/features/training").then(m => ({ default: m.TrainingPage })));

/**
 * Root redirect component
 * Redirects "/" to "/showroom" while preserving location state
 */
function RootRedirect() {
  const location = useLocation();
  return <Navigate to="/showroom" replace state={location.state} />;
}

/**
 * Main application routes
 * Uses React.lazy() for code splitting and Suspense for loading states
 * 
 * TODO: Step 1 - 路由框架已创建，但部分组件需要 props
 * 这些 props 依赖将在 Step 4（App.tsx 重写）中解决：
 * - 方案 A: 修改组件接口，使其通过 hooks 自行获取数据
 * - 方案 B: 使用 Context 传递全局状态
 * - 方案 C: 在路由层包装 Provider 组件
 */
export default function AppRoutes() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Spinner size="lg" className="mx-auto mt-20" />}>
        <Routes>
          {/* Root redirect */}
          <Route path="/" element={<RootRedirect />} />
          
          {/* Feature module routes */}
          {/* TODO: 以下路由需要传递 props，暂时注释以避免编译错误 */}
          {/* <Route path="/showroom" element={<ShowroomPage />} /> */}
          {/* <Route path="/procurement" element={<ProcurementPage />} /> */}
          {/* <Route path="/supplier" element={<SupplierPage />} /> */}
          
          {/* Protected route - requires authentication */}
          {/* <Route
            path="/crm"
            element={
              <ProtectedRoute>
                <CrmPage />
              </ProtectedRoute>
            }
          /> */}
          
          {/* <Route path="/services" element={<ServicesPage />} /> */}
          {/* <Route path="/learning" element={<LearningPage />} /> */}
          {/* <Route path="/membership" element={<MembershipPage />} /> */}
          <Route path="/training" element={<TrainingPage />} />
          
          {/* Fallback: redirect unknown routes to showroom */}
          <Route path="*" element={<Navigate to="/showroom" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

/**
 * Route preload map for prefetching on hover
 * Used by TabNav component to preload routes on mouseenter
 */
const preloadMap: Record<string, () => Promise<unknown>> = {
  "/showroom": () => import("@/features/showroom"),
  "/procurement": () => import("@/features/procurement"),
  "/supplier": () => import("@/features/supplier"),
  "/crm": () => import("@/features/crm"),
  "/services": () => import("@/features/services"),
  "/learning": () => import("@/features/learning"),
  "/membership": () => import("@/features/membership"),
  "/training": () => import("@/features/training"),
};

/**
 * Preload a route by path
 * Triggered by TabNav onMouseEnter for faster navigation
 */
export function preloadRoute(path: string) {
  preloadMap[path]?.().catch(() => {
    // Silently ignore preload failures
  });
}
