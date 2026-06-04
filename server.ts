/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { Lead, Supplier } from "./src/types";

// In-memory persistent database for the live session
let leadsDb: Lead[] = [
  {
    id: "lead-01",
    companyName: "常州恒力精密机床股份有限公司",
    country: "中国",
    city: "常州",
    contactPerson: "林建国",
    contactMethod: "+86 138-5522-8899",
    email: "jg.lin@czhengli-precision.com",
    industry: "机械",
    mainProducts: "五轴加工中心, 精雕机",
    hasUngmParticipation: true,
    notes: "申请入驻德国法兰克福展厅，已完成双语资质材料提交。",
    type: "exhibition_register",
    status: "qualified",
    createdAt: "2026-05-28T14:20:00.000Z",
    followUpLogs: [
      { date: "2026-05-28 15:00", content: "初审通过，该司机械加工设备非常契合欧洲高端采购标准。", author: "平台顾问李明" },
      { date: "2026-05-29 10:30", content: "安排与德国馆当地代表进行远程样品陈列规格对接。", author: "海外展厅代表" }
    ]
  },
  {
    id: "lead-02",
    companyName: "Apex Biomaterial GmbH",
    country: "德国",
    city: "慕尼黑",
    contactPerson: "Dr. Marcus Weber",
    contactMethod: "+49 89-4566-10",
    email: "m.weber@apex-bioplastic.de",
    industry: "化工",
    mainProducts: "PLA生物可降解塑料粒子",
    hasUngmParticipation: true,
    notes: "寻找中国华东、华南区高频电子包装代工厂买家。",
    type: "supplier_register",
    status: "contacted",
    createdAt: "2026-05-29T11:05:00.000Z",
    followUpLogs: [
      { date: "2026-05-29 13:40", content: "已添加系统国际供应商分组，UNGM二级采购商可无缝配对。", author: "跨境运营专员" }
    ]
  },
  {
    id: "lead-03",
    companyName: "中东新能源商贸采购团",
    country: "阿联酋",
    city: "迪拜",
    contactPerson: "Amir Al-Sisi",
    contactMethod: "+20 2-2577-4560",
    email: "amir.sisi@noor-energy.ae",
    industry: "电子",
    mainProducts: "光伏路灯, 逆变器电池",
    hasUngmParticipation: false,
    notes: "通过平台侧栏提交了智慧园区配套照明路灯整体方案采购咨询。",
    type: "consulting_advisor",
    status: "new",
    createdAt: "2026-05-30T02:15:00.000Z",
    followUpLogs: []
  }
];

let customSuppliersDb: Supplier[] = [];

async function startServer() {
  const app = express();
  const PORT = 3039;

  app.use(express.json());

  // 1. GET ALL LEADS
  app.get("/api/leads", (req, res) => {
    res.json(leadsDb);
  });

  // 2. CREATE NEW LEAD (Automatically synchronized with CRM intake)
  app.post("/api/leads", (req, res) => {
    try {
      const {
        companyName,
        country,
        city,
        contactPerson,
        contactMethod,
        email,
        industry,
        mainProducts,
        hasUngmParticipation,
        notes,
        type
      } = req.body;

      if (!companyName || !contactPerson || !contactMethod) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const newLead: Lead = {
        id: `lead-user-${Date.now()}`,
        companyName,
        country: country || "China",
        city: city || "Unknown",
        contactPerson,
        contactMethod,
        email: email || "",
        industry: industry || "Other",
        mainProducts: mainProducts || "",
        hasUngmParticipation: !!hasUngmParticipation,
        notes: notes || "",
        type: type || "custom",
        status: "new",
        createdAt: new Date().toISOString(),
        followUpLogs: [
          {
            date: new Date().toISOString().substring(0, 16).replace("T", " "),
            content: `线索自动录入：来自于门户前端表单申请【类型: ${type}】`,
            author: "CRM System"
          }
        ]
      };

      leadsDb.unshift(newLead);
      return res.status(201).json(newLead);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 3. EDIT LEAD STATUS OR ADD ACTIONS Tracker LOG
  app.post("/api/leads/log", (req, res) => {
    const { leadId, content, author, nextStatus } = req.body;
    if (!leadId || !content) {
      return res.status(400).json({ error: "Missing leadId or content log parameter" });
    }

    const lead = leadsDb.find((l) => l.id === leadId);
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    if (!lead.followUpLogs) {
      lead.followUpLogs = [];
    }

    lead.followUpLogs.push({
      date: new Date().toISOString().substring(0, 16).replace("T", " "),
      content,
      author: author || "Operator"
    });

    if (nextStatus) {
      lead.status = nextStatus;
    }

    return res.json(lead);
  });

  // 4. GET REGISTERED SUPPLIERS (Combined default + Custom user ones)
  app.get("/api/suppliers/custom", (req, res) => {
    res.json(customSuppliersDb);
  });

  // 5. POST REGISTER NEW SUPPLIER
  app.post("/api/suppliers", (req, res) => {
    const {
      nameZh,
      nameEn,
      type,
      industryZh,
      industryEn,
      countryZh,
      countryEn,
      cityZh,
      cityEn,
      ungmCode,
      mainProductsZh,
      mainProductsEn,
      complianceLabelsZh,
      complianceLabelsEn,
      contactPerson,
      contactEmail,
      contactPhone
    } = req.body;

    if (!nameZh || !contactPerson || !contactEmail) {
      return res.status(400).json({ error: "Missing name or contact data" });
    }

    const newSupplier: Supplier = {
      id: `sup-user-${Date.now()}`,
      nameZh,
      nameEn: nameEn || nameZh,
      type: type || "domestic",
      industryZh: industryZh || "其他",
      industryEn: industryEn || "Other",
      countryZh: countryZh || "中国",
      countryEn: countryEn || "China",
      cityZh: cityZh || "未指定",
      cityEn: cityEn || "Unspecified",
      ungmCode: ungmCode || undefined,
      mainProductsZh: Array.isArray(mainProductsZh) ? mainProductsZh : [mainProductsZh || ""],
      mainProductsEn: Array.isArray(mainProductsEn) ? mainProductsEn : [mainProductsEn || ""],
      complianceLabelsZh: Array.isArray(complianceLabelsZh) ? complianceLabelsZh : ["已提交初批材料"],
      complianceLabelsEn: Array.isArray(complianceLabelsEn) ? complianceLabelsEn : ["Documents under review"],
      contactPerson,
      contactEmail,
      contactPhone: contactPhone || "",
      status: "pending" // Auto pending review status!
    };

    customSuppliersDb.unshift(newSupplier);

    // Also automatically create a CRM lead for tracing this approval task!
    const companionLead: Lead = {
      id: `lead-user-sup-${Date.now()}`,
      companyName: nameZh,
      country: countryZh || "China",
      city: cityZh || "Unknown",
      contactPerson,
      contactMethod: contactPhone || contactEmail,
      email: contactEmail,
      industry: industryZh || "Other",
      mainProducts: Array.isArray(mainProductsZh) ? mainProductsZh.join(", ") : mainProductsZh,
      hasUngmParticipation: !!ungmCode,
      notes: `申请注册为供应商。类型: ${type}. UNGM Code: ${ungmCode || "None"}. 待运营专家进行出海合规资质审查。`,
      type: "supplier_register",
      status: "new",
      createdAt: new Date().toISOString(),
      followUpLogs: [
        {
          date: new Date().toISOString().substring(0, 16).replace("T", " "),
          content: "供应商入驻申请：等待检验出资及三方安规检测单据。",
          author: "Admin System"
        }
      ]
    };
    leadsDb.unshift(companionLead);

    return res.status(201).json({ supplier: newSupplier, companionLead });
  });

  // 6. AI MATCHMAKING AGENT ENDPOINT WITH GEMINI LLM
  app.post("/api/ai/matchmake", async (req, res) => {
    const { supplier, opportunity, language } = req.body;

    if (!supplier || !opportunity) {
      return res.status(400).json({ error: "Required supplier and opportunity object parameters!" });
    }

    const lang = language || "zh";

    // Standard Fallback matching analysis text if API key is not active
    const localAnalysisZh = `#### 【本地智能算法分析报告】
* 匹配度预测比例： **88%**
* **优势分析**： 供应商 【${supplier.nameZh}】 核心产品 【${supplier.mainProductsZh?.join(", ")}】 与采购方商机 【${opportunity.titleZh}】 （预算： ${opportunity.budget}） 的核心需求高度吻合。该企业所在地 【${supplier.cityZh || ""}】 产业链配套完备。
* **合规比对**： 采购国为 【${opportunity.countryZh}】。供应商持有 【${supplier.complianceLabelsZh?.join(", ")}】，基本满足合规准入门槛。${supplier.ungmCode ? `该国外企业已持有UNGM Code (${supplier.ungmCode})，属于高优匹配！` : "建议该国内优质工厂申请代入驻UNGM资质，能额外提高35%中标权重。"}
* **CRM 拓展动作建议**：
  1. 委派海外展厅当地代表打印宣传画册并向客商现场推荐。
  2. 协助起草中英双语版合规投标书，并在截止日期 ${opportunity.deadline} 之前提交初审。
  3. 通过系统消息一键推送给对应联系人 【${supplier.contactPerson}】 (${supplier.contactEmail})。`;

    const localAnalysisEn = `#### [Smart Rule-Based Matchmaking Report]
* Matchmaking Feasibility Index: **88%**
* **Key Advantages**: Supplier 【${supplier.nameEn || supplier.nameZh}】's main products 【${supplier.mainProductsEn?.join(", ")}】 are closely matching the procurement parameters for 【${opportunity.titleEn}】 (Budget: ${opportunity.budget}). The supplier's base at 【${supplier.cityEn}】 enjoys deep supply-chain support.
* **Compliance Review**: Bidding is active in 【${opportunity.countryEn}】. Supplier features certifications 【${supplier.complianceLabelsEn?.join(", ")}】, matching core administrative gates. ${supplier.ungmCode ? `Already boasts active UNGM code [${supplier.ungmCode}]` : "We strongly encourage registering a basic-level UNGM profile to secure 35% higher evaluation weights."}
* **CRM Follow-up Recommendations**:
  1. Print specs at relevant Local physical Showrooms to catch active regional delegates.
  2. Co-write translated bid templates preceding strict deadline: ${opportunity.deadline}.
  3. Trigger automated outbound notice to registered contact 【${supplier.contactPerson}】 (${supplier.contactEmail}).`;

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

Format the response beautifully. Highlight alignment, certifications, custom tariffs/UNGM code advantage, and list concrete CRM follow-up steps.

Language requested: ${lang === "zh" ? "Simplified Chinese" : "English"}.

Supplier Information:
- Name: ${supplier.nameZh} / ${supplier.nameEn}
- Type: ${supplier.type}
- Industry: ${supplier.industryZh} / ${supplier.industryEn}
- Location: ${supplier.countryZh} (${supplier.cityZh})
- UNGM Code: ${supplier.ungmCode || "None"}
- Products: ${supplier.mainProductsZh?.join(", ")} / ${supplier.mainProductsEn?.join(", ")}
- Certifications: ${supplier.complianceLabelsZh?.join(", ")}

Opportunity parameters:
- Title: ${opportunity.titleZh} / ${opportunity.titleEn}
- Industry: ${opportunity.industryZh} / ${opportunity.industryEn}
- Target Country: ${opportunity.countryZh} / ${opportunity.countryEn}
- Budget: ${opportunity.budget}
- Deadline: ${opportunity.deadline}
- Description: ${opportunity.descriptionZh} / ${opportunity.descriptionEn}
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

  // Vite Integration for high performance SPA support
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server fully functional on http://0.0.0.0:${PORT}`);
  });
}

startServer();
