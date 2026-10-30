/**
 * RFQ 向导常量
 * @module features/rfq/components/RfqWizard/constants
 */

export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const MAX_FILE_COUNT = 10;
export const FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp";

export const STEP_META = [
  { titleKey: "rfqStep1Title" },
  { titleKey: "rfqStep2Title" },
  { titleKey: "rfqStep3Title" },
] as const;
