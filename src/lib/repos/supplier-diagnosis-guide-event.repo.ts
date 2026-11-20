/**
 * 诊断引导卡事件埋点数据访问层
 *
 * @module lib/repos/supplier-diagnosis-guide-event.repo
 * @description 只记录曝光/点击/关闭事件，不记录页面内容；写入失败不影响 UI。
 */
import type { Pool } from "mysql2/promise";

export type DiagnosisGuideEvent = "impression" | "click" | "dismiss";

export interface DiagnosisGuideEventInput {
  userId: number;
  supplierId: number | null;
  event: DiagnosisGuideEvent;
  path: string | null;
}

export class SupplierDiagnosisGuideEventRepo {
  constructor(private pool: Pool) {}

  async record(input: DiagnosisGuideEventInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO supplier_diagnosis_guide_event (user_id, supplier_id, event, path)
       VALUES (?, ?, ?, ?)`,
      [
        input.userId,
        input.supplierId,
        input.event,
        input.path ? input.path.slice(0, 200) : null,
      ],
    );
  }
}
