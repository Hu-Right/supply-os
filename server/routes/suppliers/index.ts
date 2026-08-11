/**
 * 供应商路由组合入口
 * Composes supplier sub-routers into a single Express Router
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { SuppliersRepo } from "../../repos/suppliers.repo";
import { UsersRepo } from "../../repos/users.repo";
import { MembershipRepo } from "../../repos/membership.repo";
import { createSupplierListRouter } from "./list";
import { createSupplierContactRouter } from "./contact";
import { createSupplierRegisterRouter } from "./register";

export function createSuppliersRouter(ctx: AppContext): Router {
  const router = Router();
  const suppliersRepo = ctx.suppliersRepo ?? new SuppliersRepo(ctx.dbPool);
  const usersRepo = ctx.usersRepo ?? new UsersRepo(ctx.dbPool);
  const membershipRepo = ctx.membershipRepo ?? new MembershipRepo(ctx.dbPool);

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
    leadsDb: ctx.leadsDb,
    invalidateCache: invalidateSupplierCache,
  }));

  return router;
}
