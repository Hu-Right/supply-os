/**
 * 供应商路由组合入口
 * Composes supplier sub-routers into a single Express Router
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { createSupplierListRouter } from "./list";
import { createSupplierContactRouter } from "./contact";
import { createSupplierRegisterRouter } from "./register";

export function createSuppliersRouter(ctx: AppContext): Router {
  const router = Router();
  // 双轨制退役（轨道A）：统一走领域上下文（bootstrap 保证注入，移除 ?? 兜底构造）
  const suppliersRepo = ctx.supplier.suppliersRepo;
  const usersRepo = ctx.user.usersRepo;
  const membershipRepo = ctx.user.membershipRepo;

  // 供应商列表服务端 TTL 缓存（5 分钟）
  const supplierResponseCache = new Map<string, { data: any; expires: number }>();
  const SUPPLIER_CACHE_TTL = 5 * 60 * 1000;

  function invalidateSupplierCache() {
    supplierResponseCache.clear();
  }

  // 组合子路由
  router.use(createSupplierListRouter({
    suppliersRepo,
    cache: supplierResponseCache,
    cacheTtl: SUPPLIER_CACHE_TTL,
    invalidateCache: invalidateSupplierCache,
  }));

  router.use(createSupplierContactRouter({
    suppliersRepo,
    usersRepo,
    membershipRepo,
  }));

  router.use(createSupplierRegisterRouter({
    suppliersRepo,
    usersRepo,
    // 双轨制退役（轨道D）：注册伴生线索直接落库，不再经过内存数组
    dbPool: ctx.dbPool,
    invalidateCache: invalidateSupplierCache,
  }));

  return router;
}
