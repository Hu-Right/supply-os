// CRM 模块
export { default as CrmPage } from "./pages/CrmPage";
export { useAiMatch } from "./hooks/useAiMatch";
export { useCrmData } from "./hooks/useCrmData";
export { useDigitalAssistant } from "./hooks/useDigitalAssistant";
export type {
  ChatMessage,
  AssistantMode,
  QuickActionType,
  UseDigitalAssistantReturn,
} from "./hooks/useDigitalAssistant";
export { DigitalAssistant } from "./components/DigitalAssistant/DigitalAssistant";
