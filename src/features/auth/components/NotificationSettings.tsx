// i18n-allow-file: 通知偏好页（一期仅界面，持久化二期）
/**
 * 通知与偏好（/settings/notifications）
 *
 * 对标云厂商账号中心的「消息通知」：站内信 / 邮件 / 短信三类渠道 + 业务通知分类。
 * 一期仅 UI 展示（本地状态），偏好持久化与退订中心在二期接入。
 */
"use client";

import { useState } from "react";
import { Bell, Mail, MessageSquare, Smartphone } from "lucide-react";
import { Badge, Button } from "@/shared/ui";

type Pref = { key: string; title: string; desc: string; channels: { sms: boolean; email: boolean; inapp: boolean } };

const INITIAL: Pref[] = [
  { key: "security", title: "账号与安全通知", desc: "登录异常、密码变更、绑定关系变更（不可关闭）", channels: { sms: true, email: true, inapp: true } },
  { key: "billing", title: "订单与发票通知", desc: "支付成功、开票进度、退款进度、到期提醒", channels: { sms: true, email: true, inapp: true } },
  { key: "product", title: "产品与权益通知", desc: "新功能上线、会员权益变更、额度使用提醒", channels: { sms: false, email: true, inapp: true } },
  { key: "marketing", title: "活动与营销通知", desc: "优惠活动、运营推荐（可随时关闭）", channels: { sms: false, email: false, inapp: true } },
];

export function NotificationSettings() {
  const [prefs, setPrefs] = useState(INITIAL);
  const [saved, setSaved] = useState(false);

  const toggle = (key: string, channel: "sms" | "email" | "inapp") => {
    setSaved(false);
    setPrefs((prev) => prev.map((p) => (p.key === key ? { ...p, channels: { ...p.channels, [channel]: !p.channels[channel] } } : p)));
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground"><Bell className="h-4 w-4 text-brand-600" />通知偏好</p>
          <Badge variant="soft-neutral" shape="tag">一期仅展示</Badge>
          <p className="ml-auto text-xs text-muted-foreground">安全类通知不可关闭；其他通知按渠道分别订阅</p>
        </div>
        <div className="divide-y divide-border/70">
          {prefs.map((p) => (
            <div key={p.key} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{p.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.desc}</p>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-xs">
                {([
                  ["inapp", "站内信", <MessageSquare key="i" className="h-3.5 w-3.5" />],
                  ["email", "邮件", <Mail key="e" className="h-3.5 w-3.5" />],
                  ["sms", "短信", <Smartphone key="s" className="h-3.5 w-3.5" />],
                ] as const).map(([channel, label, icon]) => (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => toggle(p.key, channel)}
                    disabled={p.key === "security"}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold transition-colors ${
                      p.channels[channel] ? "border-brand-200 bg-brand-50 text-brand-700" : "border-border bg-white text-muted-foreground"
                    } disabled:opacity-70`}
                  >
                    {icon}{label}{p.channels[channel] ? " · 开" : ""}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">偏好持久化、退订中心与邮件偏好管理将在二期上线；当前演示仅前端状态。</p>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setSaved(true)}>保存偏好</Button>
          {saved && <span className="text-xs font-semibold text-success-700">已保存（演示，刷新后恢复默认）</span>}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-white p-5 text-xs leading-relaxed text-muted-foreground">
        <p className="text-sm font-bold text-foreground">通知渠道说明</p>
        <ul className="mt-2 space-y-1.5">
          <li>站内信：站内消息中心（二期上线消息中心页）。</li>
          <li>邮件：发送至绑定邮箱；发票开具结果默认走邮件。</li>
          <li>短信：发送至绑定手机，仅用于安全、到期与支付类通知。</li>
          <li>退订：营销类邮件与短信可随时关闭；安全类通知不提供关闭。</li>
        </ul>
      </section>
    </div>
  );
}
