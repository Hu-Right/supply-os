/**
 * 供应商诊断提交结果埋点数据访问层
 *
 * @module lib/repos/supplier-diagnosis-submit-log.repo
 * @description 只记录提交结果与错误码，不记录答案内容；写入失败不得影响主流程。
 */
import type { Pool } from "mysql2/promise";

export interface DiagnosisSubmitLogInput {
  userId: number;
  supplierId: number | null;
  companyName: string | null;
  result: "success" | "rejected" | "error";
  errorCode: string | null;
  reason: string | null;
  scoreTotal: number | null;
  clientIp: string | null;
}

export class SupplierDiagnosisSubmitLogRepo {
  constructor(private pool: Pool) {}

  async record(input: DiagnosisSubmitLogInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO supplier_diagnosis_submit_log
         (user_id, supplier_id, company_name, result, error_code, reason, score_total, client_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId,
        input.supplierId,
        input.companyName ? input.companyName.slice(0, 255) : null,
        input.result,
        input.errorCode,
        input.reason ? input.reason.slice(0, 100) : null,
        input.scoreTotal,
        input.clientIp,
      ],
    );
  }
}
