"use client";
/**
 * 企业信息设置页客户端（独立 tab）
 * @module app/(public)/settings/enterprise/page-client
 * @description 登录守卫 + 企业信息「展示表格 ↔ 表格式编辑」切换。
 *              数据源 supplier 企业表（GET /api/user/enterprise）；
 *              编辑保存 PUT（已绑定更新该行）/ POST（未绑定新建并绑定）。
 *              与诊断/审核链路（SupplierRegisterModal）完全剥离。
 */
import { useState } from "react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";
import { api } from "@/core/http";
import { Button } from "@/shared/ui";
import { Clock, AlertTriangle } from "lucide-react";
import { useClaimExpiry } from "@/shared/hooks/useClaimExpiry";
import { EnterpriseInfoCard } from "@/features/auth/components/EnterpriseInfoCard";
import { EnterpriseEditForm } from "@/features/auth/components/EnterpriseEditForm";
import { SupplierClaimModal } from "@/features/supplier-profile/components/SupplierClaimModal";
import { useEnterpriseInfo } from "@/shared/hooks/useEnterpriseInfo";
import {
  classifyEnterpriseBindState,
  enterpriseBindStateText,
} from "@/shared/utils/enterprise-status";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";

const btnBlue = "px-4 py-1.5 rounded-md bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors shrink-0";

export default function EnterpriseSettingsClient() {
  const { authUser } = useAuth();
  const { t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // 信息型提示（认领引导一类）与报错分开渲染，避免把「该走认领」也涂成红色失败
  const [notice, setNotice] = useState<string | null>(null);
  const [claimTarget, setClaimTarget] = useState<{ id: number; company: string } | null>(null);
  /** 换绑二次确认弹窗开关与撤回进行中标识 */
  const [withdrawConfirm, setWithdrawConfirm] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const enterprise = useEnterpriseInfo();
  const { claimExpiry, countdown } = useClaimExpiry(
    authUser?.id,
    enterprise.enterprise?.id ? Number(enterprise.enterprise.id) : undefined,
    enterprise.bound,
  );

  // 未登录：登录引导
  if (!authUser) {
    return (
      <div className="bg-secondary-50 border border-border rounded-xl p-10 text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("settingsProfileNeedLogin") || "查看企业信息需要先登录。"}
        </p>
        <Button variant="primary" onClick={() => emitAppEvent("supply-os:require-login")}>
          {t("settingsProfileGoLogin") || "立即登录"}
        </Button>
      </div>
    );
  }

  // V2（ADR-0004）：企业信息与供应商资源库不再互斥，已建库也可进入本页绑定/编辑企业。

  // 绑定状态口径与后端排他闸口同源：这里只负责把「已绑定/审核中/已认证」如实告知用户
  const bindState = classifyEnterpriseBindState(enterprise.enterprise);
  const bindText = enterpriseBindStateText(bindState);
  const boundCompany = enterprise.enterprise
    ? String(enterprise.enterprise.name_confirmed || enterprise.enterprise.company || "")
    : "";
  // 换绑出口（与服务端闸口同一分状态口径）：还没拿下认证的绑定可自助撤回；
  // 已认证的不能自助拆（只能后台重审/客服），所以连按钮也不出现，避免点了才报错。
  const canWithdraw = enterprise.bound && !enterprise.loading && bindState !== "verified";

  /** 撤回当前绑定：后端不接收 supplierId，只能拆自己这一行；成功后重取状态并引导重新填写 */
  const handleWithdraw = async () => {
    setWithdrawing(true);
    setMessage(null);
    setNotice(null);
    try {
      await api("/api/user/enterprise/withdraw", { method: "POST" });
      setWithdrawConfirm(false);
      setNotice(
        t("authEnterpriseWithdrawDone") || "已撤回企业绑定，请点击「填写企业信息」为新企业提交认证",
      );
      enterprise.retry();
      emitAppEvent("supply-os:enterprise-changed");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : (t("authEnterpriseWithdrawFailed") || "撤回失败，请稍后重试"));
      enterprise.retry();
    } finally {
      setWithdrawing(false);
    }
  };

  /** 认领提交成功（含表单引导与 POST claimRequired 两条路径）：临时绑定已建立，刷新后保存走 PUT 并入该行 */
  const handleClaimSuccess = () => {
    setClaimTarget(null);
    enterprise.retry();
    emitAppEvent("supply-os:enterprise-changed");
    setNotice(
      t("authEnterpriseClaimSubmitted") ||
        "认领申请已提交，请在 1 小时内上传营业执照并保存，逾期将自动解绑",
    );
  };

  const handleSubmit = async (values: Record<string, string>) => {
    setSaving(true);
    setMessage(null);
    setNotice(null);
    try {
      if (enterprise.bound) {
        await api("/api/user/enterprise", { method: "PUT", body: values });
      } else {
        const res = await api<{ supplierId?: number; claimRequired?: boolean }>("/api/user/enterprise", {
          method: "POST",
          body: values,
        });
        // 命中已认证企业：不落库、不退出编辑态，引导认领；认领提交后保存走 PUT 并入该行
        if (res?.claimRequired && res.supplierId) {
          setNotice(
            t("authEnterpriseClaimRequired") || "该企业已通过平台认证，请通过认领流程完成绑定",
          );
          setClaimTarget({ id: Number(res.supplierId), company: String(values.company || "") });
          return;
        }
      }
      setEditing(false);
      enterprise.retry();
      // 通知全局：企业身份已变更 → 同步刷新资源库判定与 settings 排他/顶部引导卡片
      emitAppEvent("supply-os:enterprise-changed");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : (t("authEnterpriseSaveFailed") || "保存失败"));
      // 失败常见成因是本地 bound 已过期（认领逾期自动解绑 / 另一端已完成绑定）：
      // 重取一次让页面回到真实状态，避免用户沿着旧状态反复重试。
      enterprise.retry();
      emitAppEvent("supply-os:enterprise-changed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 w-full">
      {/* 头部：标题 + 操作按钮（视图态） */}
      {!editing && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">
            {t("authEnterpriseTitle") || "企业信息"}
          </h2>
          <button type="button" className={btnBlue} onClick={() => setEditing(true)}>
            {enterprise.bound
              ? (t("authEnterpriseEdit") || "编辑")
              : (t("authEnterpriseFill") || "填写企业信息")}
          </button>
        </div>
      )}

      {message && (
        <p className="text-xs font-medium text-danger-600 bg-danger-50 border border-danger-200 rounded-lg p-3">
          {message}
        </p>
      )}

      {notice && (
        <p className="text-xs font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-lg p-3">
          {notice}
        </p>
      )}

      {/* 已绑定时的状态与换绑出口：避免用户以为还能再提交一次认证，也不让人被旧绑定锁死 */}
      {enterprise.bound && !enterprise.loading && (
        <div className="space-y-2 rounded-lg border border-border bg-secondary-50 p-3">
          <p className="text-xs text-muted-foreground">
            {bindState === "verified"
              ? (t("authEnterpriseVerifiedLocked") ||
                  "企业已通过认证，不能自助换绑；如需变更主体请联系客服，由后台重新审核。")
              : (t("authEnterpriseBoundLockHint") ||
                  "一个账号只能认证一家企业；如需修改资料请使用「编辑」保存。")}
            {boundCompany
              ? `（当前：${boundCompany} · ${t(bindText.key) || bindText.fallback}）`
              : ""}
          </p>
          {canWithdraw && (
            <button
              type="button"
              className="text-xs font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
              onClick={() => setWithdrawConfirm(true)}
            >
              {t("authEnterpriseWithdrawAction") || "撤回当前绑定，换绑其他企业"}
            </button>
          )}
        </div>
      )}

      {/* 认领过期倒计时横幅 */}
      {claimExpiry && countdown && countdown !== "已过期" && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="font-medium">认领待完善</span>
          <span className="text-xs text-amber-600">请在 <strong>{countdown}</strong> 内完善企业信息并上传营业执照，逾期将自动解除绑定</span>
        </div>
      )}
      {countdown === "已过期" && (
        <div className="flex items-center gap-2 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3 text-sm text-danger-700">
          <Clock className="w-4 h-4 shrink-0" />
          <span>认领已过期，绑定已自动解除。如需绑定请重新认领。</span>
        </div>
      )}

      {editing ? (
        <EnterpriseEditForm
          initial={enterprise.enterprise}
          saving={saving}
          onSubmit={handleSubmit}
          onCancel={() => setEditing(false)}
          licenseUrl={enterprise.enterprise?.license_url ? String(enterprise.enterprise.license_url) : null}
          onClaimRequest={setClaimTarget}
        />
      ) : (
        <EnterpriseInfoCard
          enterprise={enterprise.enterprise}
          linkStatus={enterprise.linkStatus}
          loading={enterprise.loading}
          error={enterprise.error}
          onRetry={enterprise.retry}
          onBind={() => setEditing(true)}
        />
      )}

      {/* 换绑二次确认：撤回后旧申请作废（不删企业资料），可重新为另一家提交 */}
      <ConfirmDialog
        open={withdrawConfirm}
        onClose={() => setWithdrawConfirm(false)}
        onConfirm={handleWithdraw}
        variant="danger"
        loading={withdrawing}
        title={t("authEnterpriseWithdrawTitle") || "撤回企业绑定"}
        description={(t("authEnterpriseWithdrawConfirm") ||
          "撤回后「{name}」的认证/认领申请将作废（企业资料仍保留在平台，只解除与本账号的绑定），之后可重新为另一家企业提交认证。确认撤回？")
          .replace("{name}", boundCompany || "当前企业")}
        confirmLabel={t("authEnterpriseWithdraw") || "撤回绑定"}
      />

      {/* 认领弹窗（表单候选引导 / POST claimRequired 两条路径共用） */}
      {claimTarget && (
        <SupplierClaimModal
          supplierId={claimTarget.id}
          companyName={claimTarget.company}
          onClose={() => setClaimTarget(null)}
          onSuccess={handleClaimSuccess}
        />
      )}
    </div>
  );
}
