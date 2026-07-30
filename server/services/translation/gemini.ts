/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from "@google/genai";

export async function translateNoticeText(
  title: string,
  description: string,
  langName: string
): Promise<{ title: string; description: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    throw new Error("TRANSLATION_UNAVAILABLE");
  }
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
  const prompt = `You are a professional procurement document translator. Translate the tender notice fields below into ${langName}.
Rules:
- Keep organization names, reference numbers, UNSPSC codes, URLs, emails and abbreviations (e.g. UNGM, RFQ, ITB, EOI) unchanged.
- Preserve line breaks inside the description.
- Return ONLY valid JSON in exactly this shape: {"title": "...", "description": "..."}

TITLE:
${title}

DESCRIPTION:
${description}`;
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
  });
  const raw = (response.text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const parsed = JSON.parse(raw);
  if (typeof parsed?.title !== "string" || typeof parsed?.description !== "string") {
    throw new Error("TRANSLATION_MALFORMED");
  }
  return { title: parsed.title, description: parsed.description };
}

export type SupplierTranslatableFields = {
  industry: string;
  mainProducts: string;
  certification: string;
  enterpriseNature: string;
};

export async function translateSupplierFields(
  fields: SupplierTranslatableFields,
  langName: string
): Promise<SupplierTranslatableFields> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    throw new Error("TRANSLATION_UNAVAILABLE");
  }
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
  const prompt = `You are a professional B2B trade-directory translator. Translate the Chinese supplier profile fields below into ${langName}.
Rules:
- Keep certification abbreviations (e.g. ISO, FDA, CE, 3C, GMP, RoHS) and brand names unchanged.
- Keep list separators (commas) unchanged so each field stays a comma-separated list.
- If a field is empty, return an empty string for it.
- Return ONLY valid JSON in exactly this shape: {"industry": "...", "mainProducts": "...", "certification": "...", "enterpriseNature": "..."}

INDUSTRY:
${fields.industry}

MAIN PRODUCTS:
${fields.mainProducts}

CERTIFICATION:
${fields.certification}

ENTERPRISE NATURE:
${fields.enterpriseNature}`;
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
  });
  const raw = (response.text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const parsed = JSON.parse(raw);
  if (
    typeof parsed?.industry !== "string" ||
    typeof parsed?.mainProducts !== "string" ||
    typeof parsed?.certification !== "string" ||
    typeof parsed?.enterpriseNature !== "string"
  ) {
    throw new Error("TRANSLATION_MALFORMED");
  }
  return {
    industry: parsed.industry,
    mainProducts: parsed.mainProducts,
    certification: parsed.certification,
    enterpriseNature: parsed.enterpriseNature,
  };
}

// 整批列表一次调用：children 列表 ≤ 60 条，逐条调用会打爆配额
export async function translateUnspscTitles(titles: string[], langName: string): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    throw new Error("TRANSLATION_UNAVAILABLE");
  }
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
  const prompt = `You are a professional translator of the UNSPSC procurement classification. Translate each category title in the JSON array below into ${langName}.
Rules:
- Keep abbreviations, acronyms and proper nouns unchanged.
- Return ONLY a valid JSON array of strings with exactly ${titles.length} items, in the same order as the input.

INPUT:
${JSON.stringify(titles)}`;
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
  });
  const raw = (response.text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const parsed = JSON.parse(raw);
  if (
    !Array.isArray(parsed) ||
    parsed.length !== titles.length ||
    parsed.some((item) => typeof item !== "string")
  ) {
    throw new Error("TRANSLATION_MALFORMED");
  }
  return parsed;
}
