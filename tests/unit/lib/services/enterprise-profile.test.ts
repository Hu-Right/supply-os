import { describe, it, expect } from "vitest";
import {
  addCapability,
  addEvidence,
  getEnterpriseProfile,
  removeCapability,
  removeEvidence,
  type EnterpriseProfileRepoLike,
} from "@/lib/services/enterprise-profile";
import type { CapabilityRow, EvidenceRow, VerifiedEnterpriseRow } from "@/lib/repos/enterprise-profile.repo";
import { EC_ACCESS_FORBIDDEN, EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";

/**
 * 能力档案 / 证据服务（2026-11-18 起证据为纯登记，不再有文件上传与下载地址）
 */
function makeRepo(overrides: { enterprise?: VerifiedEnterpriseRow | null } = {}) {
  const state = {
    enterprise: overrides.enterprise === undefined
      ? { id: 1001, company: "宁波照明", certification: "ISO9001", certification_tags: null, country: "中国" }
      : overrides.enterprise,
    capabilities: [] as CapabilityRow[],
    evidence: [] as EvidenceRow[],
    seq: 0,
    evidenceSeq: 0,
  };
  const repo: EnterpriseProfileRepoLike = {
    async findVerifiedEnterprise() {
      return state.enterprise;
    },
    async listCapabilities() {
      return state.capabilities;
    },
    async insertCapability(params) {
      state.seq += 1;
      state.capabilities.push({
        id: state.seq,
        enterprise_id: params.enterpriseId,
        capability_type: params.capabilityType,
        name: params.name,
        value_json: params.value,
        evidence_refs_json: params.evidenceRefs,
        confirmation_json: params.confirmation,
      });
      return state.seq;
    },
    async deleteCapability(_e, id) {
      const before = state.capabilities.length;
      state.capabilities = state.capabilities.filter((c) => c.id !== id);
      return state.capabilities.length < before;
    },
    async listEvidence() {
      return state.evidence;
    },
    async insertEvidence(params) {
      state.evidenceSeq += 1;
      state.evidence.push({
        id: state.evidenceSeq,
        enterprise_id: params.enterpriseId,
        category: params.category,
        title: params.title,
        valid_from: params.validFrom,
        valid_until: params.validUntil,
        no_expiry: params.noExpiry ? 1 : 0,
        confirmed: params.confirmed ? 1 : 0,
        created_at: new Date().toISOString(),
      });
      return state.evidenceSeq;
    },
    async deleteEvidence(_e, id) {
      const before = state.evidence.length;
      state.evidence = state.evidence.filter((e) => e.id !== id);
      return state.evidence.length < before;
    },
  };
  return { repo, state };
}

describe("enterprise-profile 能力档案/证据服务", () => {
  it("未认证企业 → 403", async () => {
    const { repo } = makeRepo({ enterprise: null });
    await expect(getEnterpriseProfile(repo, 1)).rejects.toMatchObject({ status: 403, code: EC_ACCESS_FORBIDDEN });
  });

  it("读取档案：capabilities/evidence 视图为 camelCase，证据只有登记字段", async () => {
    const { repo, state } = makeRepo();
    state.capabilities.push({
      id: 1, enterprise_id: 1001, capability_type: "certification", name: "ISO 9001",
      value_json: { kind: "certification", code: "ISO9001", validUntil: "2028-01-01" },
      evidence_refs_json: [], confirmation_json: {},
    });
    state.evidence.push({
      id: 2, enterprise_id: 1001,
      category: "cert", title: "ISO9001 证书", valid_from: "2025-01-01", valid_until: "2028-01-01",
      no_expiry: 0, confirmed: 1, created_at: "",
    });
    const data = await getEnterpriseProfile(repo, 1);
    expect(data).toMatchObject({ enterpriseId: 1001, company: "宁波照明" });
    expect(data.capabilities[0]).toMatchObject({ id: 1, type: "certification", name: "ISO 9001" });
    expect(data.evidence[0]).toEqual({
      id: 2, category: "cert", title: "ISO9001 证书",
      validFrom: "2025-01-01", validUntil: "2028-01-01", noExpiry: false,
    });
    // 文件相关字段已摘除：视图不得再出现 hasFile / downloadUrl
    expect(data.evidence[0]).not.toHaveProperty("hasFile");
    expect(data.evidence[0]).not.toHaveProperty("downloadUrl");
  });

  it("新增证书：有效期必填（或长期有效），保存成功返回视图", async () => {
    const { repo, state } = makeRepo();
    await expect(
      addCapability(repo, 1, { type: "certification", name: "ISO 14001", value: { code: "ISO14001" } }),
    ).rejects.toMatchObject({ status: 400, code: EC_INVALID_PARAMS });

    const created = await addCapability(repo, 1, {
      type: "certification",
      name: "ISO 14001",
      value: { code: "ISO14001", validUntil: "2028-06-30" },
    });
    expect(created).toMatchObject({ id: 1, type: "certification", name: "ISO 14001" });
    expect((created.value as Record<string, unknown>).validUntil).toBe("2028-06-30");
    expect(state.capabilities).toHaveLength(1);
  });

  it("新增业绩：数量/年限至少一项；非法类型拒绝", async () => {
    const { repo, state } = makeRepo();
    await expect(addCapability(repo, 1, { type: "unknown", name: "x", value: {} })).rejects.toMatchObject({ status: 400 });
    await expect(addCapability(repo, 1, { type: "experience", name: "业绩", value: {} })).rejects.toMatchObject({ status: 400 });
    const created = await addCapability(repo, 1, { type: "experience", name: "近三年项目", value: { count: 2, years: 3 } });
    expect(created.value).toMatchObject({ kind: "experience", count: 2, years: 3 });
    expect(state.capabilities).toHaveLength(1);
  });

  it("删除不存在的能力项 → 404", async () => {
    const { repo } = makeRepo();
    await expect(removeCapability(repo, 1, 999)).rejects.toMatchObject({ status: 404, code: EC_NOT_FOUND });
  });

  it("登记证据：证书类需有效期；成功入库且不写文件", async () => {
    const { repo, state } = makeRepo();
    await expect(
      addEvidence(repo, 1, { category: "cert", title: "ISO 证书", noExpiry: false }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      addEvidence(repo, 1, { category: "unknown", title: "x", noExpiry: true }),
    ).rejects.toMatchObject({ status: 400 });

    const created = await addEvidence(repo, 1, {
      category: "cert", title: "ISO 证书", validUntil: "2028-01-01", noExpiry: false,
    });
    expect(created).toEqual({
      id: 1, category: "cert", title: "ISO 证书",
      validFrom: null, validUntil: "2028-01-01", noExpiry: false,
    });
    expect(state.evidence).toHaveLength(1);
    expect(state.evidence[0]).toMatchObject({ category: "cert", title: "ISO 证书", no_expiry: 0 });
  });

  it("长期有效的证据：validUntil 落 null", async () => {
    const { repo, state } = makeRepo();
    const created = await addEvidence(repo, 1, { category: "experience", title: "合同", noExpiry: true });
    expect(created.noExpiry).toBe(true);
    expect(created.validUntil).toBeNull();
    expect(state.evidence[0].no_expiry).toBe(1);
    expect(state.evidence[0].valid_until).toBeNull();
  });

  it("删除不存在的证据 → 404；删除已有证据成功", async () => {
    const { repo } = makeRepo();
    await expect(removeEvidence(repo, 1, 1)).rejects.toMatchObject({ status: 404 });
    await addEvidence(repo, 1, { category: "experience", title: "合同", noExpiry: true });
    await expect(removeEvidence(repo, 1, 1)).resolves.toBeUndefined();
  });
});
