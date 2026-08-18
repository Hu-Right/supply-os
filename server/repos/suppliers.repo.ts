/**
 * 供应商数据访问层 — 向后兼容聚合入口
 * Suppliers Repository — Backward-compatible Facade
 *
 * @module server/repos/suppliers.repo
 * @deprecated 已拆分至 suppliers/ 子目录。本文件保留 SuppliersRepo 聚合类
 *             以维持 ctx.supplier.suppliersRepo.xxx 调用方的向后兼容。
 *             新代码请直接导入子 Repo（如 SupplierDirectoryRepo）。
 * @see suppliers/index.ts
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { SupplierDirectoryRepo, type SupplierDirectoryRow } from "./suppliers/supplier-directory.repo";
import { SupplierRegistrationRepo, type SupplierTranslationRow } from "./suppliers/supplier-registration.repo";
import { SupplierClaimRepo } from "./suppliers/supplier-claim.repo";

export type { SupplierDirectoryRow } from "./suppliers/supplier-directory.repo";
export type { SupplierTranslationRow } from "./suppliers/supplier-registration.repo";

/**
 * @deprecated 请使用子 Repo（SupplierDirectoryRepo / SupplierRegistrationRepo / SupplierClaimRepo）
 */
export class SuppliersRepo {
  private directoryRepo: SupplierDirectoryRepo;
  private registrationRepo: SupplierRegistrationRepo;
  private claimRepo: SupplierClaimRepo;

  constructor(private pool: Pool) {
    this.directoryRepo = new SupplierDirectoryRepo(pool);
    this.registrationRepo = new SupplierRegistrationRepo(pool);
    this.claimRepo = new SupplierClaimRepo(pool);
  }

  // ── 委托至 SupplierDirectoryRepo ──
  listDirectory() { return this.directoryRepo.listDirectory(); }
  listDirectoryPaginated(params: { limit: number; offset: number; lang: string; search?: string; type?: string; industry?: string }) {
    return this.directoryRepo.listDirectoryPaginated(params);
  }
  findContact(supplierId: number) { return this.directoryRepo.findContact(supplierId); }

  // ── 委托至 SupplierRegistrationRepo ──
  findBasicInfo(id: number) { return this.registrationRepo.findBasicInfo(id); }
  findCrmByRequestHash(requestHash: string) { return this.registrationRepo.findCrmByRequestHash(requestHash); }
  insertCrmSupplier(data: { companyName: string; contactName: string; telephone: string; email: string; mainProduct: string; industry: string; certification: string; requestHash: string }) {
    return this.registrationRepo.insertCrmSupplier(data);
  }
  findCrmById(id: number) { return this.registrationRepo.findCrmById(id); }
  findCrmIdByCompanyName(companyName: string) { return this.registrationRepo.findCrmIdByCompanyName(companyName); }
  listTranslations(lang: string, supplierIds: number[]) { return this.registrationRepo.listTranslations(lang, supplierIds); }
  upsertTranslation(supplierId: number, lang: string, industryTr: string, mainProductsTr: string, model: string) {
    return this.registrationRepo.upsertTranslation(supplierId, lang, industryTr, mainProductsTr, model);
  }

  // ── 委托至 SupplierClaimRepo ──
  insertClaim(params: { userKey: string; supplierId: number | null; companyName: string; supplierType: string; contactName: string; contactPhone: string; contactEmail: string; businessLicenseNo: string }) {
    return this.claimRepo.insertClaim(params);
  }
}
