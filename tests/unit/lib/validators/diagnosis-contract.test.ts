/**
 * 诊断提交「前端请求体 ↔ 服务端校验器」契约测试
 * Wire-contract test between submitDiagnosis() and parseDiagnosisPayload()
 *
 * @module tests/unit/lib/validators/diagnosis-contract
 * @description 为什么单独一个文件：这次线上真跑出来的 400 不是校验规则写错，而是**两端对
 *              请求体形状的理解不一致**——前端发嵌套 `answers`，服务端从根层取值。
 *              规则单测按自己那套形状构造 fixture，所以全绿；只有真机点提交才炸。
 *              本测试把「客户端真正发出去的 body」原样喂给服务端校验器，跨边界钉住形状，
 *              任何一侧单独改形状都会在这里失败。
 */
import { describe, it, expect, vi } from "vitest";
import { DIAGNOSIS_FIELDS } from "@/shared/constants/diagnosis-dimensions";
import { parseDiagnosisPayload } from "@/lib/validators/diagnosis";

/** 捕获 submitDiagnosis 交给 http 层的 body 原值（不经过真实网络） */
const wire: { url?: string; body?: unknown } = {};

vi.mock("@/core/http", () => ({
  api: (url: string, opts?: { body?: unknown }) => {
    wire.url = url;
    wire.body = opts?.body;
    return Promise.resolve({ code: 0, message: "ok", data: {} });
  },
  downloadFile: () => Promise.resolve(undefined),
}));

// 必须在 vi.mock 之后再引入被测模块
import { submitDiagnosis, type DiagnosisAnswers } from "@/shared/api/diagnosis";

/** 按常量生成一份「每题都答在允许档位内」的完整答案 */
function completeAnswers(): DiagnosisAnswers {
  const answers: DiagnosisAnswers = {};
  for (const f of DIAGNOSIS_FIELDS) {
    if (f.kind === "multi") answers[f.key] = [...(f.options ?? [])].slice(0, 2);
    else if (f.kind === "text") answers[f.key] = "德国, 法国";
    else answers[f.key] = f.options![1];
  }
  return answers;
}

describe("诊断提交请求体契约", () => {
  it("submitDiagnosis 落到线上的 body 能被服务端校验器判为合法", async () => {
    await submitDiagnosis({
      companyName: "杭州中建工程技术有限公司",
      supplierId: 18296,
      answers: completeAnswers(),
    });

    expect(wire.url).toBe("/api/supplier-diagnosis");
    const body = wire.body as Record<string, unknown>;
    // 先钉形状：答案必须嵌在 answers 里，服务端就是按这个形状读的
    expect(body).toHaveProperty("answers");
    expect(body).not.toHaveProperty("english_evidence_level");

    const parsed = parseDiagnosisPayload(body);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.payload.companyName).toBe("杭州中建工程技术有限公司");
      expect(parsed.payload.supplierId).toBe(18296);
      // 19 题一题不丢地过校验（少一题就会在这里被 missing/invalid 挡下）
      expect(Object.keys(parsed.payload.answers)).toHaveLength(DIAGNOSIS_FIELDS.length);
    }
  });

  it("服务端把形状错误报成契约问题，而不是伪装成某道必答题未答", async () => {
    // 手滑把答案平铺到根层（就是这次的真实缺陷形态）
    const flat = completeAnswers() as Record<string, unknown>;
    const parsed = parseDiagnosisPayload({ companyName: "杭州中建工程技术有限公司", ...flat });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.fieldKey).toBe("answers");
  });
});
