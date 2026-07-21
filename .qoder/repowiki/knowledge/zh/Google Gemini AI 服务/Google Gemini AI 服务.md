---
kind: external_dependency
name: Google Gemini AI 服务
slug: google-gemini-api
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

通过 `@google/genai` SDK 调用 Google Gemini 3.5 进行 AI 供采匹配分析。API Key 通过环境变量 `GEMINI_API_KEY` 注入，在 AI Studio 环境中由 Secrets 面板自动配置。前端通过 `/api/ai/matchmake` 后端代理接口间接调用，不直接暴露密钥。