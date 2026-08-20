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
  // #7：领域上下文直接注入子 Repo（原聚合 Facade 已删除）
  const { directoryRepo, registrationRepo, claimRepo } = ctx.supplier;
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
    directoryRepo,
    registrationRepo,
    cache: supplierResponseCache,
    cacheTtl: SUPPLIER_CACHE_TTL,
    invalidateCache: invalidateSupplierCache,
  }));

  router.use(createSupplierContactRouter({
    directoryRepo,
    usersRepo,
    membershipRepo,
  }));

  router.use(createSupplierRegisterRouter({
    registrationRepo,
    claimRepo,
    usersRepo,
    // 双轨制退役（轨道D）：注册伴生线索直接落库，不再经过内存数组
    dbPool: ctx.dbPool,
    invalidateCache: invalidateSupplierCache,
  }));

  return router;
}
