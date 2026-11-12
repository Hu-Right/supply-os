/**
 * 诊断入口「是不是贵公司」确认弹窗
 * "Is this your company?" confirmation dialog
 *
 * @module shared/forms/DiagnosisCompanyDialog
 * @description 只做一件事：确认主体。文案刻意压到最少（只留标题与两个动作），
 *              因为弹窗不是说明书 —— 引导性描述会逐语言漂移，而“这不是我的公司”必须是按钮而不是段落。
 *              功能约束不变：不提供任何企业资料编辑口（规范 N2，资料改在设置页），
 *              不触发认领（规范 N7，不占用 7 天排他锁），展示字段按规范 N9 脱敏。
 *              2026-11-11 一司一份口径：有主主体（他人绑定 / 认领排他期 / 已认证且非我的）
 *              「选不中」——按钮禁用 + 提示条；自己的主体（mine）即使已认证也放行。
 *              这里只是体验层，权威闸口在 POST /api/supplier-diagnosis（getWriteGate，403）。
 */
import { Badge, Button, Modal } from "@/shared/ui";
import type { DiagnosisCandidate } from "@/shared/api/diagnosis";

type T = (key: string) => string;

interface Props {
  open: boolean;
  candidates: DiagnosisCandidate[];
  t: T;
  onClose: () => void;
  onConfirm: (candidate: DiagnosisCandidate) => void;
  onNotMine: () => void;
}

function identityLine(c: DiagnosisCandidate): string {
  return [c.province, c.city, c.establishedAt, c.legalRep, c.creditCodeMasked]
    .filter(Boolean)
    .join(" · ");
}

/** 与服务端 diagnosisWriteGateDecision 同口径的前端预判：有主且非我的主体选不中 */
function isBlocked(c: DiagnosisCandidate): boolean {
  return c.bound || c.claimPending || (c.verified && !c.mine);
}

export function DiagnosisCompanyDialog({ open, candidates, t, onClose, onConfirm, onNotMine }: Props) {
  return (
    <Modal open={open} onClose={onClose} className="max-w-lg">
      <div className="p-6">
        <h2 className="text-base font-bold text-slate-900">{t("diagDialogTitle")}</h2>

        <ul className="mt-4 space-y-2.5">
          {candidates.map((c) => {
            const blocked = isBlocked(c);
            return (
              <li key={c.supplierId} className="rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">{c.company}</p>
                    <p className="mt-1 text-2xs text-slate-500">{identityLine(c)}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {c.mine && <Badge variant="success">{t("diagBadgeMine")}</Badge>}
                      {c.bound && <Badge variant="error">{t("diagBadgeBound")}</Badge>}
                      {c.verified && <Badge variant="success">{t("diagBadgeVerified")}</Badge>}
                      {c.claimPending && <Badge variant="warning">{t("diagBadgeClaimPending")}</Badge>}
                    </div>
                    {blocked && (
                      <p className="mt-1.5 text-2xs font-medium text-amber-700">{t("diagDialogLocked")}</p>
                    )}
                  </div>
                  <Button size="sm" disabled={blocked} onClick={() => onConfirm(c)}>
                    {t("diagDialogConfirm")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onClose} className="text-xs font-medium text-slate-500 underline">
            {t("diagDialogRethink")}
          </button>
          <Button variant="secondary" onClick={onNotMine}>
            {t("diagDialogNotMine")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
