/**
 * 投标可行性报告 —— 确定性判定规则（v0.1）
 *
 * @module lib/services/feasibility-report/rules
 * @description 每条规则是纯函数：RequirementItem + CapabilityItem[] → RuleResult。
 *              规则之外的计算（有效期/数量/金额/单位）都在这里用代码完成；
 *              无法判定的情况一律 `unknown`（不允许编造 satisfied）。
 *              规则清单见 docs/P0-投标可行性报告/02-判定规则清单.md。
 */
import type {
  CapabilityItem,
  CapabilityType,
  EvaluateContext,
  RequirementItem,
  RuleResult,
} from "./types";
import {
  compareWithUnit,
  DEFAULT_MIN_PREP_DAYS,
  equivalentButDifferent,
  sameCertCode,
} from "./knowledge";

// ── 工具 ──────────────────────────────────────────────────────────────

const capsOfType = (caps: CapabilityItem[], type: CapabilityType) =>
  caps.filter((c) => c.type === type);

const evidenceRefsOf = (cap: CapabilityItem | undefined): string[] =>
  (cap?.evidenceRefs ?? []).map((e) => e.id).filter(Boolean);

const refsFor = (req: RequirementItem, cap?: CapabilityItem): string[] => {
  const refs = [req.id, ...evidenceRefsOf(cap)];
  return Array.from(new Set(refs));
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** 比较数值：返回是否满足 operator（缺省 >=） */
function satisfiesOperator(actual: number, expected: number, operator: string | null | undefined): boolean {
  switch (operator ?? ">=") {
    case "<=":
      return actual <= expected;
    case "<":
      return actual < expected;
    case ">":
      return actual > expected;
    case "==":
      return actual === expected;
    case ">=":
    default:
      return actual >= expected;
  }
}

/** 有效期判断：noExpiry / validUntil ≥ 截止日 */
function certificationValid(value: Record<string, unknown>, deadlineIso: string): "valid" | "expired" | "unknown" {
  if (value.noExpiry === true) return "valid";
  const until = str(value.validUntil);
  if (!until) return "unknown";
  const untilTs = Date.parse(until);
  const deadlineTs = Date.parse(deadlineIso);
  if (!Number.isFinite(untilTs) || !Number.isFinite(deadlineTs)) return "unknown";
  return untilTs >= deadlineTs ? "valid" : "expired";
}

// ── 证书/资质 ─────────────────────────────────────────────────────────

function certRule(req: RequirementItem, caps: CapabilityItem[], ctx: EvaluateContext): RuleResult {
  const certCaps = capsOfType(caps, "certification");
  const requiredCode = str((req.value as Record<string, unknown> | null | undefined)?.code) || str(req.value?.name);
  if (certCaps.length === 0) {
    return { ruleId: "CERT-00", status: "unknown", refs: refsFor(req), detail: { reason: "企业档案中无证书类能力项" } };
  }
  // 精确同名
  const exact = certCaps.find((c) => sameCertCode(str((c.value as Record<string, unknown>).code), requiredCode))
    ?? (requiredCode ? undefined : certCaps[0]);
  if (exact) {
    const validity = certificationValid(exact.value as Record<string, unknown>, ctx.bidDeadline);
    const ruleId = validity === "expired" ? "CERT-02" : "CERT-01";
    return {
      ruleId,
      status: validity === "valid" ? "satisfied" : validity === "expired" ? "expired" : "unknown",
      refs: refsFor(req, exact),
      detail: { certCode: requiredCode, validUntil: (exact.value as Record<string, unknown>).validUntil ?? null },
    };
  }
  // 等效但不同名 → partial，需人工确认
  const equivalent = certCaps.find((c) => equivalentButDifferent(str((c.value as Record<string, unknown>).code), requiredCode));
  if (equivalent) {
    return {
      ruleId: "CERT-03",
      status: "partial",
      refs: refsFor(req, equivalent),
      confidence: 0.6,
      detail: { certCode: requiredCode, equivalentCapability: equivalent.name, needConfirm: "证书体系等效性需人工/等效表确认" },
    };
  }
  return { ruleId: "CERT-01", status: "missing", refs: refsFor(req), detail: { certCode: requiredCode, reason: "未找到对应证书" } };
}

// ── 业绩/经验 ─────────────────────────────────────────────────────────

function experienceRule(req: RequirementItem, caps: CapabilityItem[], ctx: EvaluateContext): RuleResult {
  void ctx;
  const expCaps = capsOfType(caps, "experience");
  if (expCaps.length === 0) {
    return { ruleId: "EXP-00", status: "unknown", refs: refsFor(req), detail: { reason: "企业档案中无业绩类能力项" } };
  }
  const reqValue = (req.value ?? {}) as Record<string, unknown>;
  const requiredCount = num(reqValue.count);
  const requiredYears = num(reqValue.years);
  const requiredScope = str(reqValue.similarScope).toLowerCase();

  const matched = requiredScope
    ? expCaps.find((c) => str(c.name).toLowerCase().includes(requiredScope) || str(c.value?.scope).toLowerCase().includes(requiredScope))
    : expCaps[0];
  const cap = matched ?? expCaps[0];
  const capValue = (cap.value ?? {}) as Record<string, unknown>;
  const actualCount = num(capValue.count) ?? 0;
  const actualYears = num(capValue.years);

  const countOk = requiredCount == null ? true : actualCount >= requiredCount;
  const yearsOk = requiredYears == null || actualYears == null ? true : actualYears >= requiredYears;

  let status: RuleResult["status"];
  const ruleId = "EXP-01";
  if (countOk && yearsOk) status = "satisfied";
  else if (actualCount > 0 || (actualYears != null && requiredYears != null && actualYears >= requiredYears)) {
    status = "partial";
  } else status = "missing";

  return {
    ruleId,
    status,
    refs: refsFor(req, cap),
    detail: { requiredCount, requiredYears, actualCount, actualYears, requiredScope: requiredScope || null },
  };
}

// ── 财务 ──────────────────────────────────────────────────────────────

function financialRule(req: RequirementItem, caps: CapabilityItem[]): RuleResult {
  const finCaps = capsOfType(caps, "financial");
  const reqValue = (req.value ?? {}) as Record<string, unknown>;
  const metric = str(reqValue.metric);
  const expected = num(reqValue.value);
  const operator = str(reqValue.operator) || ">=";
  if (expected == null) return { ruleId: "FIN-00", status: "unknown", refs: refsFor(req), detail: { reason: "要求缺少结构化数值" } };
  const cap = finCaps.find((c) => str((c.value as Record<string, unknown>).metric) === metric);
  if (!cap) {
    return { ruleId: "FIN-00", status: "unknown", refs: refsFor(req), detail: { reason: `缺少 ${metric} 财务数据` } };
  }
  const capValue = (cap.value ?? {}) as Record<string, unknown>;
  const actual = num(capValue.value);
  if (actual == null) return { ruleId: "FIN-00", status: "unknown", refs: refsFor(req, cap) };
  return {
    ruleId: "FIN-01",
    status: satisfiesOperator(actual, expected, operator) ? "satisfied" : "missing",
    refs: refsFor(req, cap),
    detail: { metric, expected, operator, actual, year: capValue.year ?? null },
  };
}

// ── 本地化 / 注册 / 语言 ──────────────────────────────────────────────

function localizationRule(req: RequirementItem, caps: CapabilityItem[]): RuleResult {
  const reqValue = (req.value ?? {}) as Record<string, unknown>;
  const requires = Array.isArray(reqValue.requires) ? reqValue.requires.map(str) : [];
  const locCaps = capsOfType(caps, "localization");
  if (locCaps.length === 0) {
    return { ruleId: "LOC-00", status: "unknown", refs: refsFor(req), detail: { reason: "企业档案中无本地化信息" } };
  }
  const cap = locCaps[0];
  const capValue = (cap.value ?? {}) as Record<string, unknown>;
  const missing = requires.filter((key) => capValue[key] !== true);
  return {
    ruleId: "LOC-01",
    status: missing.length === 0 ? "satisfied" : missing.length === requires.length ? "missing" : "partial",
    refs: refsFor(req, cap),
    detail: { requires, missing },
  };
}

function registrationRule(req: RequirementItem, caps: CapabilityItem[]): RuleResult {
  const reqValue = (req.value ?? {}) as Record<string, unknown>;
  const platform = str(reqValue.platform).toLowerCase();
  const regCaps = capsOfType(caps, "registration");
  if (regCaps.length === 0) {
    return { ruleId: "REG-00", status: "unknown", refs: refsFor(req), detail: { reason: "企业档案中无平台注册信息" } };
  }
  const cap = regCaps.find((c) => !platform || str((c.value as Record<string, unknown>).platform).toLowerCase() === platform);
  if (!cap) return { ruleId: "REG-01", status: "missing", refs: refsFor(req), detail: { platform } };
  const capValue = (cap.value ?? {}) as Record<string, unknown>;
  const status = str(capValue.status).toLowerCase();
  return {
    ruleId: "REG-01",
    status: status === "active" ? "satisfied" : status ? "missing" : "unknown",
    refs: refsFor(req, cap),
    detail: { platform, status: status || null },
  };
}

function languageRule(req: RequirementItem, caps: CapabilityItem[]): RuleResult {
  const reqValue = (req.value ?? {}) as Record<string, unknown>;
  const required = str(reqValue.language).toLowerCase();
  const textCaps = capsOfType(caps, "text");
  const langCap = textCaps.find((c) => Array.isArray((c.value as Record<string, unknown>).languages));
  if (!required) return { ruleId: "LANG-00", status: "unknown", refs: refsFor(req) };
  if (!langCap) return { ruleId: "LANG-00", status: "unknown", refs: refsFor(req), detail: { reason: "未声明语言能力" } };
  const languages = ((langCap.value as Record<string, unknown>).languages as unknown[]).map((l) => str(l).toLowerCase());
  return {
    ruleId: "LANG-01",
    status: languages.includes(required) ? "satisfied" : "missing",
    refs: refsFor(req, langCap),
    detail: { required, languages },
  };
}

// ── 技术 / 交付 / 质保 ────────────────────────────────────────────────

function technicalRule(req: RequirementItem, caps: CapabilityItem[]): RuleResult {
  const reqValue = (req.value ?? {}) as Record<string, unknown>;
  const parameter = str(reqValue.parameter);
  const expected = num(reqValue.value);
  const operator = str(reqValue.operator) || ">=";
  if (!parameter || expected == null) {
    return { ruleId: "TEC-00", status: "unknown", refs: refsFor(req), detail: { reason: "技术参数未结构化" } };
  }
  const techCaps = capsOfType(caps, "technical");
  const cap = techCaps.find((c) => str((c.value as Record<string, unknown>).parameter).toLowerCase() === parameter.toLowerCase());
  if (!cap) {
    return { ruleId: "TEC-00", status: "unknown", refs: refsFor(req), detail: { reason: `缺少 ${parameter} 能力数据` } };
  }
  const capValue = (cap.value ?? {}) as Record<string, unknown>;
  const actual = num(capValue.value);
  if (actual == null) return { ruleId: "TEC-00", status: "unknown", refs: refsFor(req, cap) };
  const cmp = compareWithUnit(
    { value: actual, unit: str(capValue.unit) },
    { value: expected, unit: str(reqValue.unit) },
  );
  if (cmp == null) {
    return { ruleId: "TEC-00", status: "unknown", refs: refsFor(req, cap), detail: { reason: "单位无法换算" } };
  }
  return {
    ruleId: "TEC-01",
    status: satisfiesOperator(actual, expected, operator) ? "satisfied" : "missing",
    refs: refsFor(req, cap),
    detail: { parameter, operator, expected, unit: reqValue.unit ?? null, actual, capUnit: capValue.unit ?? null },
  };
}

function deliveryRule(req: RequirementItem, caps: CapabilityItem[]): RuleResult {
  const reqValue = (req.value ?? {}) as Record<string, unknown>;
  const expected = num(reqValue.days);
  if (expected == null) return { ruleId: "DEL-00", status: "unknown", refs: refsFor(req) };
  const techCaps = capsOfType(caps, "technical");
  const cap = techCaps.find((c) => str((c.value as Record<string, unknown>).parameter).toLowerCase() === "deliverydays");
  if (!cap) return { ruleId: "DEL-00", status: "unknown", refs: refsFor(req), detail: { reason: "缺少交付期能力数据" } };
  const actual = num((cap.value as Record<string, unknown>).value);
  if (actual == null) return { ruleId: "DEL-00", status: "unknown", refs: refsFor(req, cap) };
  return {
    ruleId: "DEL-01",
    status: actual <= expected ? "satisfied" : "missing",
    refs: refsFor(req, cap),
    detail: { expected, actual },
  };
}

function warrantyRule(req: RequirementItem, caps: CapabilityItem[]): RuleResult {
  const reqValue = (req.value ?? {}) as Record<string, unknown>;
  const expected = num(reqValue.years);
  if (expected == null) return { ruleId: "COM-00", status: "unknown", refs: refsFor(req) };
  const textCaps = capsOfType(caps, "text");
  const cap = textCaps.find((c) => num((c.value as Record<string, unknown>).warrantyYears) != null);
  if (!cap) return { ruleId: "COM-00", status: "unknown", refs: refsFor(req), detail: { reason: "缺少质保年限数据" } };
  const actual = num((cap.value as Record<string, unknown>).warrantyYears) as number;
  return {
    ruleId: "COM-02",
    status: actual >= expected ? "satisfied" : "missing",
    refs: refsFor(req, cap),
    detail: { expected, actual },
  };
}

// ── 提交 / 保证金 ─────────────────────────────────────────────────────

function submissionRule(req: RequirementItem, caps: CapabilityItem[]): RuleResult {
  const reqValue = (req.value ?? {}) as Record<string, unknown>;
  const items = Array.isArray(reqValue.items) ? reqValue.items.map(str).filter(Boolean) : [];
  if (items.length === 0) return { ruleId: "SUB-00", status: "unknown", refs: refsFor(req), detail: { reason: "未抽取到提交文件清单" } };
  const textCaps = capsOfType(caps, "text");
  const cap = textCaps.find((c) => Array.isArray((c.value as Record<string, unknown>).documents));
  if (!cap) return { ruleId: "SUB-00", status: "unknown", refs: refsFor(req), detail: { reason: "未确认可提交的文件清单" } };
  const docs = ((cap.value as Record<string, unknown>).documents as unknown[]).map((d) => str(d).toLowerCase());
  const missing = items.filter((item) => !docs.some((doc) => doc.includes(item.toLowerCase())));
  return {
    ruleId: "SUB-01",
    status: missing.length === 0 ? "satisfied" : missing.length === items.length ? "missing" : "partial",
    refs: refsFor(req, cap),
    detail: { items, missing },
  };
}

function bondRule(req: RequirementItem, caps: CapabilityItem[]): RuleResult {
  const reqValue = (req.value ?? {}) as Record<string, unknown>;
  const required = num(reqValue.amount);
  if (required == null) return { ruleId: "BND-00", status: "unknown", refs: refsFor(req) };
  const finCaps = capsOfType(caps, "financial");
  const cap = finCaps.find((c) => str((c.value as Record<string, unknown>).metric) === "creditLine");
  if (!cap) return { ruleId: "BND-00", status: "unknown", refs: refsFor(req), detail: { reason: "未提供授信/保函额度" } };
  const actual = num((cap.value as Record<string, unknown>).value) ?? 0;
  return {
    ruleId: "BND-01",
    status: actual >= required ? "satisfied" : "missing",
    refs: refsFor(req, cap),
    detail: { required, actual },
  };
}

// ── 入口：单要求项判定 ────────────────────────────────────────────────

export function evaluateRequirement(
  req: RequirementItem,
  caps: CapabilityItem[],
  ctx: EvaluateContext,
): RuleResult {
  // NA-01：公告明确"不适用于本项目/该国家"时直接不适用
  const reqValue = (req.value ?? {}) as Record<string, unknown>;
  if (reqValue.applicable === false) {
    return { ruleId: "NA-01", status: "not_applicable", refs: [req.id], detail: { reason: str(reqValue.notApplicableReason) || "公告声明不适用" } };
  }
  switch (req.type) {
    case "certification":
      return certRule(req, caps, ctx);
    case "experience":
      return experienceRule(req, caps, ctx);
    case "financial":
      return financialRule(req, caps);
    case "localization":
      return localizationRule(req, caps);
    case "registration":
      return registrationRule(req, caps);
    case "language":
      return languageRule(req, caps);
    case "technical":
      return technicalRule(req, caps);
    case "delivery":
      return deliveryRule(req, caps);
    case "warranty":
      return warrantyRule(req, caps);
    case "submission":
      return submissionRule(req, caps);
    case "bond":
      return bondRule(req, caps);
    case "personnel":
    case "commercial":
    case "other":
    default:
      return {
        ruleId: "UNK-01",
        status: "unknown",
        refs: [req.id],
        detail: { reason: `该要求类型（${req.type}）v0.1 尚未接入确定性规则，需人工确认` },
      };
  }
}

/** 投标准备期风险（DEL-02）：截止 - 今天 < 最小准备天数 */
export function preparationRisk(ctx: EvaluateContext): { risk: boolean; daysLeft: number | null } {
  const todayTs = Date.parse(ctx.today ?? new Date().toISOString());
  const deadlineTs = Date.parse(ctx.bidDeadline);
  const minDays = ctx.minPrepDays ?? DEFAULT_MIN_PREP_DAYS;
  if (!Number.isFinite(todayTs) || !Number.isFinite(deadlineTs)) return { risk: false, daysLeft: null };
  const daysLeft = (deadlineTs - todayTs) / 86_400_000;
  return { risk: daysLeft < minDays, daysLeft };
}
