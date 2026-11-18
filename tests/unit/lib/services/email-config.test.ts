import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAIL_FROM,
  resolveDkimConfig,
  resolveMailIdentity,
  unsubscribeHeaders,
} from "@/lib/services/email-config";

describe("resolveMailIdentity", () => {
  it("未配置 SMTP_FROM 时使用兜底发件人，且不下发 Reply-To", () => {
    expect(resolveMailIdentity({})).toEqual({ from: DEFAULT_MAIL_FROM });
  });

  it("SMTP_FROM 去空白，SMTP_REPLY_TO 为空视作未配置", () => {
    expect(resolveMailIdentity({ SMTP_FROM: ' "A" <a@x.com> ', SMTP_REPLY_TO: "   " })).toEqual({
      from: '"A" <a@x.com>',
    });
  });

  it("配置 SMTP_REPLY_TO 时一并返回", () => {
    expect(resolveMailIdentity({ SMTP_FROM: "a@x.com", SMTP_REPLY_TO: "support@x.com" })).toEqual({
      from: "a@x.com",
      replyTo: "support@x.com",
    });
  });
});

describe("resolveDkimConfig", () => {
  const base = {
    SMTP_DKIM_DOMAIN: "mail.x.com",
    SMTP_DKIM_SELECTOR: "dkim",
    SMTP_DKIM_PRIVATE_KEY: "-----BEGIN KEY-----\\nabc\\n-----END KEY-----",
  };

  it("三项齐全才启用，并把 \\n 还原为换行", () => {
    expect(resolveDkimConfig(base)).toEqual({
      domainName: "mail.x.com",
      keySelector: "dkim",
      privateKey: "-----BEGIN KEY-----\nabc\n-----END KEY-----",
    });
  });

  it("缺任意一项即不启用（不做半套签名）", () => {
    expect(resolveDkimConfig({})).toBeUndefined();
    expect(resolveDkimConfig({ ...base, SMTP_DKIM_SELECTOR: "" })).toBeUndefined();
    expect(resolveDkimConfig({ ...base, SMTP_DKIM_PRIVATE_KEY: "  " })).toBeUndefined();
  });
});

describe("unsubscribeHeaders", () => {
  it("生成尖括号包裹的 List-Unsubscribe", () => {
    expect(unsubscribeHeaders("https://x.com/unsubscribe?token=t")).toEqual({
      "List-Unsubscribe": "<https://x.com/unsubscribe?token=t>",
    });
  });

  it("空 URL 不产生退订头", () => {
    expect(unsubscribeHeaders("   ")).toEqual({});
  });
});
