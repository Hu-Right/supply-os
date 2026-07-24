/**
 * 公告解锁记录列表
 * Notice unlock history list
 *
 * @module features/payment/components/UnlockHistoryList
 * @description 将解锁记录映射为 PaymentRecordCard 网格
 *              Maps unlock records into a grid of PaymentRecordCard
 */

import { useLocale } from "@/core/i18n";
import type { LocaleKey } from "@/core/i18n/types";
import type { BadgeProps } from "@/shared/ui";
import type { UnlockRecord } from "../api";
import { PaymentRecordCard } from "./PaymentRecordCard";

const UNLOCK_VARIANT: Record<string, BadgeProps["variant"]> = {
  free: "default",
  single: "info",
  subscription: "success",
};

const UNLOCK_LABEL_KEY: Record<string, LocaleKey> = {
  free: "myPurchasesUnlock_free",
  single: "myPurchasesUnlock_single",
  subscription: "myPurchasesUnlock_subscription",
};

function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale);
}

export interface UnlockHistoryListProps {
  unlocks: UnlockRecord[];
  onOpenNotice?: (noticeId: number) => void;
}

export function UnlockHistoryList({ unlocks, onOpenNotice }: UnlockHistoryListProps) {
  const { t, locale } = useLocale();

  const unlockLabel = (unlockType: string) => {
    const key = UNLOCK_LABEL_KEY[unlockType];
    return key ? t(key) : unlockType;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {unlocks.map((unlock) => (
        <PaymentRecordCard
          key={`${unlock.notice_id}-${unlock.unlocked_at || ""}`}
          title={unlock.notice?.title || `#${unlock.notice_id}`}
          statusLabel={unlockLabel(unlock.unlock_type)}
          statusVariant={UNLOCK_VARIANT[unlock.unlock_type] || "default"}
          amountLabel={unlock.price > 0 ? `¥${unlock.price}` : undefined}
          meta={[
            { label: t("myPurchasesUnlockType"), value: unlockLabel(unlock.unlock_type) },
            { label: t("myPurchasesUnlockedAt"), value: formatDateTime(unlock.unlocked_at, locale) },
          ]}
          noticeTitle={unlock.notice?.title}
          noticeUrl={unlock.notice?.url}
          noticeLinkLabel={t("myPurchasesRelatedNotice")}
          onOpenNotice={onOpenNotice && unlock.notice_id ? () => onOpenNotice(unlock.notice_id) : undefined}
          openLabel={t("myPurchasesOpenDetail")}
        />
      ))}
    </div>
  );
}

UnlockHistoryList.displayName = "UnlockHistoryList";
