/**
 * 输入状态指示器
 * Typing Indicator Component
 *
 * @module features/crm/components/DigitalAssistant/TypingIndicator
 * @description AI 正在思考时的三点跳动动画
 *              Three-dot bounce animation shown while AI is thinking
 */

export function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-es-sm px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </div>
  );
}

TypingIndicator.displayName = "TypingIndicator";
