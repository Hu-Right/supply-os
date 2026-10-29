import { describe, it, expect } from "vitest";
import {
  addCapability,
  addEvidence,
  getEnterpriseProfile,
  getEvidenceFile,
  removeCapability,
  removeEvidence,
  type EnterpriseProfileRepoLike,
} from "@/lib/services/enterprise-profile";
import type { CapabilityRow, EvidenceRow, VerifiedEnterpriseRow } from "@/lib/repos/enterprise-profile.repo";
import { EC_ACCESS_FORBIDDEN, EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";

function makeRepo(overrides: { enterprise?: VerifiedEnterpriseRow | null } = {}) {
  const state = {
    enterprise: overrides.enterprise === undefined
      ? { id: 1001, company: "宁波照明", certification: "ISO9001", certification_tags: null, country: "中国" }
      : overrides.enterprise,
    capabilities: [] as CapabilityRow[],
    evidence: [] as EvidenceRow[],
    files: new Map<string, { content: Buffer; contentType: string }>(),
    uploads: [] as Array<{ filename: string; contentType: string; size: number }>,
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
    async insertUploadFile(params) {
      state.uploads.push({ filename: params.filename, contentType: params.contentType, size: params.buffer.length });
      state.files.set(params.filename, { content: params.buffer, contentType: params.contentType });
      return params.filename;
    },
    async insertEvidence(params) {
      state.evidenceSeq += 1;
      state.evidence.push({
        id: state.evidenceSeq,
        enterprise_id: params.enterpriseId,
        upload_file_id: null,
        upload_filename: params.uploadFilename,
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
      const target = state.evidence.find((e) => e.id === id);
      if (!target) return { deleted: false, uploadFilename: null };
      state.evidence = state.evidence.filter((e) => e.id !== id);
      return { deleted: true, uploadFilename: target.upload_filename };
    },
    async findEvidenceFile(_e, id) {
      const row = state.evidence.find((e) => e.id === id);
      if (!row || !row.upload_filename) return null;
      const file = state.files.get(row.upload_filename);
      return file ? { filename: row.upload_filename, content: file.content, content_type: file.contentType } : null;
    },
  };
  return { repo, state };
}

describe("enterprise-profile 能力档案/证据服务", () => {
  it("未认证企业 → 403", async () => {
    const { repo } = makeRepo({ enterprise: null });
    await expect(getEnterpriseProfile(repo, 1)).rejects.toMatchObject({ status: 403, code: EC_ACCESS_FORBIDDEN });
  });

  it("读取档案：capabilities/evidence 视图为 camelCase，证据带下载地址", async () => {
    const { repo, state } = makeRepo();
    state.capabilities.push({
      id: 1, enterprise_id: 1001, capability_type: "certification", name: "ISO 9001",
      value_json: { kind: "certification", code: "ISO9001", validUntil: "2028-01-01" },
      evidence_refs_json: [], confirmation_json: {},
    });
    state.evidence.push({
      id: 2, enterprise_id: 1001, upload_file_id: null, upload_filename: "evidence_1_1.pdf",
      category: "cert", title: "ISO9001 证书", valid_from: "2025-01-01", valid_until: "2028-01-01",
      no_expiry: 0, confirmed: 1, created_at: "",
    });
    const data = await getEnterpriseProfile(repo, 1);
    expect(data).toMatchObject({ enterpriseId: 1001, company: "宁波照明" });
    expect(data.capabilities[0]).toMatchObject({ id: 1, type: "certification", name: "ISO 9001" });
    expect(data.evidence[0]).toMatchObject({
      id: 2, category: "cert", hasFile: true, validUntil: "2028-01-01",
      downloadUrl: "/api/user/enterprise/evidence/2/file",
    });
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

  it("上传证据：证书类需有效期；文件类型白名单；成功入库 upload_files", async () => {
    const { repo, state } = makeRepo();
    await expect(
      addEvidence(repo, 1, { category: "cert", title: "ISO 证书", noExpiry: false, file: null }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      addEvidence(repo, 1, {
        category: "cert", title: "ISO 证书", validUntil: "2028-01-01",
        file: { buffer: Buffer.from("x"), contentType: "application/x-msdownload", size: 1 },
      }),
    ).rejects.toMatchObject({ status: 400 });

    const created = await addEvidence(repo, 1, {
      category: "cert", title: "ISO 证书", validUntil: "2028-01-01",
      file: { buffer: Buffer.from("pdf-bytes"), contentType: "application/pdf", size: 9 },
    });
    expect(created).toMatchObject({ category: "cert", title: "ISO 证书", noExpiry: false, hasFile: true });
    expect(created.downloadUrl).toMatch(/^\/api\/user\/enterprise\/evidence\/\d+\/file$/);
    expect(state.uploads[0].filename).toMatch(/^evidence_1_\d+\.pdf$/);
    expect(state.evidence).toHaveLength(1);
  });

  it("证据文件读取：归属校验 + 字节/类型返回；无文件 → 404", async () => {
    const { repo } = makeRepo();
    await addEvidence(repo, 1, {
      category: "experience", title: "合同扫描件", file: { buffer: Buffer.from("pdf"), contentType: "application/pdf", size: 3 },
    });
    const file = await getEvidenceFile(repo, 1, 1);
    expect(file.contentType).toBe("application/pdf");
    expect(file.content.toString()).toBe("pdf");
    expect(file.filename).toMatch(/^evidence_1_\d+\.pdf$/);

    await expect(getEvidenceFile(repo, 1, 999)).rejects.toMatchObject({ status: 404 });
  });

  it("删除不存在的证据 → 404；删除已有证据返回 deleted", async () => {
    const { repo } = makeRepo();
    await expect(removeEvidence(repo, 1, 1)).rejects.toMatchObject({ status: 404 });
    await addEvidence(repo, 1, { category: "experience", title: "合同", file: null });
    await expect(removeEvidence(repo, 1, 1)).resolves.toBeUndefined();
  });
});
