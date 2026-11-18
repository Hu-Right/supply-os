import type { Metadata } from "next";
import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "AI 模型配置",
  description: "配置您的 LLM API，用于生成个性化 AI 拆标摘要。",
};

export default function AiModelSettingsPage() {
  return <PageClient />;
}
