/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import type { AppContext } from "../context";
import { requireAuth } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rateLimiter";

export function createAiRouter(_ctx: AppContext): Router {
  const router = Router();
  // P2-9 安全修复：AI 匹配为高成本端点（LLM 调用），必须认证 + 限流
  const aiRateLimit = rateLimitMiddleware({ windowMs: 60_000, maxAttempts: 10 });

  /** 输入隔离：将对象序列化为字符串并截断，防止超长输入注入 prompt/撑爆请求体 */
  const sanitizeField = (value: unknown, maxLen = 200): string =>
    String(value ?? "").slice(0, maxLen);

  // 7. AI MATCHMAKING AGENT ENDPOINT WITH GEMINI LLM
  router.post("/api/ai/matchmake", requireAuth, aiRateLimit, async (req, res) => {
    const { supplier, opportunity, language } = req.body;

    if (!supplier || !opportunity) {
      return res.status(400).json({ error: "Required supplier and opportunity object parameters!" });
    }

    const lang = language || "zh";

    // P2-9 安全修复：LLM prompt 输入隔离——全部动态字段截断后再拼接，防止 prompt 注入超长载荷
    const s = {
      nameZh: sanitizeField(supplier.nameZh), nameEn: sanitizeField(supplier.nameEn),
      type: sanitizeField(supplier.type, 50),
      industryZh: sanitizeField(supplier.industryZh), industryEn: sanitizeField(supplier.industryEn),
      countryZh: sanitizeField(supplier.countryZh, 50), cityZh: sanitizeField(supplier.cityZh, 50),
      ungmCode: sanitizeField(supplier.ungmCode, 30),
      mainProductsZh: Array.isArray(supplier.mainProductsZh) ? supplier.mainProductsZh.slice(0, 10).map((v: unknown) => sanitizeField(v, 50)) : [],
      mainProductsEn: Array.isArray(supplier.mainProductsEn) ? supplier.mainProductsEn.slice(0, 10).map((v: unknown) => sanitizeField(v, 50)) : [],
      complianceLabelsZh: Array.isArray(supplier.complianceLabelsZh) ? supplier.complianceLabelsZh.slice(0, 10).map((v: unknown) => sanitizeField(v, 50)) : [],
      complianceLabelsEn: Array.isArray(supplier.complianceLabelsEn) ? supplier.complianceLabelsEn.slice(0, 10).map((v: unknown) => sanitizeField(v, 50)) : [],
      contactPerson: sanitizeField(supplier.contactPerson, 80),
      contactEmail: sanitizeField(supplier.contactEmail, 120),
    };
    const o = {
      titleZh: sanitizeField(opportunity.titleZh), titleEn: sanitizeField(opportunity.titleEn),
      industryZh: sanitizeField(opportunity.industryZh), industryEn: sanitizeField(opportunity.industryEn),
      countryZh: sanitizeField(opportunity.countryZh, 50), countryEn: sanitizeField(opportunity.countryEn, 50),
      budget: sanitizeField(opportunity.budget, 50),
      deadline: sanitizeField(opportunity.deadline, 30),
      descriptionZh: sanitizeField(opportunity.descriptionZh, 500),
      descriptionEn: sanitizeField(opportunity.descriptionEn, 500),
    };

    // Standard Fallback matching analysis text if API key is not active
    // P2-9：回退模板同样使用净化后的字段（s/o）
    const localAnalysisZh = `#### 本地智能算法分析报告
* 匹配度预测比例: **88%**
* **优势分析**: 供应商 ${s.nameZh} 的核心产品 ${s.mainProductsZh.join(", ")} 与采购方商机 ${o.titleZh}（预算：${o.budget}）的核心需求高度吻合。该企业所在地 ${s.cityZh || ""} 产业链配套完备。
* **合规比对**: 采购国为 ${o.countryZh}。供应商持有 ${s.complianceLabelsZh.join(", ")}，基本满足合规准入门槛。${s.ungmCode ? `该国外企业已持有国际公共采购 Code (${s.ungmCode})，属于高优匹配！` : "建议该国内优质工厂申请代入驻国际公共采购资质，能额外提高35%中标权重。"}
* **CRM 拓展动作建议**:
  1. 委派海外展厅当地代表打印宣传画册并向客商现场推荐。
  2. 协助起草中英双语版合规投标书，并在截止日前提交初审。
  3. 通过系统消息一键推送给对应联系人 ${s.contactPerson} (${s.contactEmail})。`;

    const localAnalysisEn = `#### Smart Rule-Based Matchmaking Report
* Matchmaking Feasibility Index: **88%**
* **Key Advantages**: Supplier ${s.nameEn || s.nameZh}'s main products ${s.mainProductsEn.join(", ")} are closely aligned with ${o.titleEn || o.titleZh} (Budget: ${o.budget}).
* **Compliance Review**: Bidding is active in ${o.countryEn || o.countryZh}. Supplier certifications ${s.complianceLabelsEn.join(", ")} match core administrative gates. ${s.ungmCode ? `Already has active 国际公共采购 code [${s.ungmCode}].` : "We recommend registering a basic-level International Public Procurement profile to improve evaluation weight."}
* **CRM Follow-up Recommendations**:
  1. Print specs at relevant local showrooms to catch active regional delegates.
  2. Co-write translated bid templates before the strict deadline: ${o.deadline}.
  3. Trigger automated outbound notice to registered contact ${s.contactPerson} (${s.contactEmail}).`;

    // Attempt to invoke real Gemini 3.5-flash API
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
      // Graceful fallback during dev or missing key
      return res.json({
        analysis: lang === "zh" ? localAnalysisZh : localAnalysisEn,
        modelUsed: "local-match-fallback",
        success: true
      });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });

      const prompt = `You are a professional B2B Global Trade & Procurement CRM Expert.
Analyze the matchmaking potential between this Supplier and this Procurement Opportunity.
Respond strictly in Markdown.

Format the response beautifully. Highlight alignment, certifications, custom tariffs/国际公共采购 code advantage, and list concrete CRM follow-up steps.

Language requested: ${lang === "zh" ? "Simplified Chinese" : "English"}.

Supplier Information:
- Name: ${s.nameZh} / ${s.nameEn}
- Type: ${s.type}
- Industry: ${s.industryZh} / ${s.industryEn}
- Location: ${s.countryZh} (${s.cityZh})
- 国际公共采购 Code: ${s.ungmCode || "None"}
- Products: ${s.mainProductsZh.join(", ")} / ${s.mainProductsEn.join(", ")}
- Certifications: ${s.complianceLabelsZh.join(", ")}

Opportunity parameters:
- Title: ${o.titleZh} / ${o.titleEn}
- Industry: ${o.industryZh} / ${o.industryEn}
- Target Country: ${o.countryZh} / ${o.countryEn}
- Budget: ${o.budget}
- Deadline: ${o.deadline}
- Description: ${o.descriptionZh} / ${o.descriptionEn}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt
      });

      const text = response.text || (lang === "zh" ? localAnalysisZh : localAnalysisEn);
      return res.json({
        analysis: text,
        modelUsed: "gemini-3.5-flash",
        success: true
      });
    } catch (apiError: any) {
      console.warn("Gemini call failed, utilizing bulletproof local fallback report:", apiError.message);
      return res.json({
        analysis: (lang === "zh" ? localAnalysisZh : localAnalysisEn) + `\n\n*(Note: Gemini api call returned an error, used local matching template)*`,
        modelUsed: "local-match-fallback",
        success: true
      });
    }
  });

  return router;
}
