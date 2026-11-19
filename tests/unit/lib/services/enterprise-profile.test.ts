import { describe, it, expect } from "vitest";
import {
  addCapability,
  getEnterpriseProfile,
  removeCapability,
  type EnterpriseProfileRepoLike,
} from "@/lib/services/enterprise-profile";
import type { CapabilityRow, VerifiedEnterpriseRow } from "@/lib/repos/enterprise-profile.repo";
import { EC_ACCESS_FORBIDDEN, EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";

/**
 * 能力档案服务（2026-11-19 起证据资料已摘除，见迁移 056）
 */
function makeRepo(overrides: { enterprise?: VerifiedEnterpriseRow | null } = {}) {
  const state = {
    enterprise: overrides.enterprise === undefined
      ? { id: 1001, company: "宁波照明", certification: "ISO9001", certification_tags: null, country: "中国" }
      : overrides.enterprise,
    capabilities: [] as CapabilityRow[],
    seq: 0,
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
  };
  return { repo, state };
}

describe("enterprise-profile 能力档案服务", () => {
  it("未认证企业 → 403", async () => {
    const { repo } = makeRepo({ enterprise: null });
    await expect(getEnterpriseProfile(repo, 1)).rejects.toMatchObject({ status: 403, code: EC_ACCESS_FORBIDDEN });
  });

  it("读取档案：capabilities 视图为 camelCase，且不含证据字段", async () => {
    const { repo, state } = makeRepo();
    state.capabilities.push({
      id: 1, enterprise_id: 1001, capability_type: "certification", name: "ISO 9001",
      value_json: { kind: "certification", code: "ISO9001", validUntil: "2028-01-01" },
      evidence_refs_json: [], confirmation_json: {},
    });
    const data = await getEnterpriseProfile(repo, 1);
    expect(data).toMatchObject({ enterpriseId: 1001, company: "宁波照明" });
    expect(data.capabilities[0]).toMatchObject({ id: 1, type: "certification", name: "ISO 9001" });
    // 证据资料已整体下线，视图不得再返回 evidence
    expect(data).not.toHaveProperty("evidence");
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
});
