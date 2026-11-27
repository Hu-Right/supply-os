/**
 * 短信发送服务
 * SMS Service
 *
 * @module server/services/sms
 * @description 发送短信验证码，支持 mock、阿里云国内短信、阿里云国际/港澳台短信。
 *
 *              两条阿里云通道**不是同一个 API**（2026-11-18 核对控制台与官方文档后修正）：
 *              - 中国大陆（+86）：老版 `SendSms`（Dysmsapi 2017-05-25），需要已审核的
 *                短信签名 + 短信模板，模板里用 `${code}` 变量；
 *              - 国际/港澳台：新版「国际/港澳台 API」`SendMessageToGlobe`
 *                （Dysmsapi 2018-05-01），**无需签名和模板**，使用 Sender ID（From）
 *                作为发送方标识，直接填写短信正文；发送频率/默认有效期在控制台
 *                「国际/港澳台短信 → 国际消息设置」中配置。
 *                要求：账户已开通国际/港澳台短信 + 配置了 Sender ID（部分国家/地区
 *                还需先报备 Sender ID）。
 *
 *              环境变量缺失时优雅降级，抛出明确错误供上层处理。
 */

import crypto from "crypto";
import { maskPhone } from "../utils/mask";
import { isMainlandE164, smsTargetOf } from "../utils/phone";
import { VERIFICATION_CODE_EXPIRES_MS } from "@/shared/constants/time";

const SMS_PROVIDER = process.env.SMS_PROVIDER || "mock"; // "mock" | "aliyun"
const SMS_ACCESS_KEY_ID = process.env.SMS_ACCESS_KEY_ID;
const SMS_ACCESS_KEY_SECRET = process.env.SMS_ACCESS_KEY_SECRET;
const SMS_SIGN_NAME = process.env.SMS_SIGN_NAME || "恒创联众";
const SMS_TEMPLATE_CODE = process.env.SMS_TEMPLATE_CODE || "100001"; // 国内默认模板（绑定/解绑/换绑）
const SMS_TEMPLATE_CODE_RESET = process.env.SMS_TEMPLATE_CODE_RESET; // 国内找回密码专用模板

/**
 * 国际/港澳台通道（新版国际 API：无需签名/模板）。
 * - SMS_INTL_SENDER_ID：可选 Sender ID（From），字母数字混合 ≤11 位、纯数字 ≤15 位；
 *   不配则由阿里云使用默认 Sender ID（部分目标国家/地区要求先报备自有 Sender ID）；
 * - SMS_INTL_ENDPOINT：可选，默认 dysmsapi.ap-southeast-1.aliyuncs.com
 *   （国际/港澳台 API 专用端点；国内的 dysmsapi.aliyuncs.com 不支持该 API 版本）；
 * - SMS_INTL_MESSAGE_VERIFY / SMS_INTL_MESSAGE_RESET：可选正文模板，
 *   `{code}` 会被替换成验证码；未配置时用内置英文短信模板。
 */
const SMS_INTL_SENDER_ID = process.env.SMS_INTL_SENDER_ID?.trim();

/** 国际/港澳台 API 默认端点（2026-11-18 实测：只有该端点接受 Dysmsapi 2018-05-01 版本） */
export const INTL_SMS_ENDPOINT_DEFAULT = "dysmsapi.ap-southeast-1.aliyuncs.com";
const SMS_INTL_ENDPOINT = process.env.SMS_INTL_ENDPOINT?.trim() || INTL_SMS_ENDPOINT_DEFAULT;

/** 国际短信默认正文（英文，避免部分国家/地区对中文内容的额外审核/乱码问题） */
export const INTL_SMS_DEFAULTS = {
  verify: "Your verification code is {code}. It is valid for 10 minutes.",
  reset:
    "Your password reset code is {code}. It is valid for 10 minutes. If you did not request it, please ignore this message.",
} as const;

/** 国际短信校验码有效时长（秒），与站点验证码过期时间一致 */
const INTL_VALIDITY_SECONDS = Math.max(Math.round(VERIFICATION_CODE_EXPIRES_MS / 1000), 60);

/**
 * 短信场景：verify = 注册/绑定/换绑/解绑，reset = 找回密码。
 * 国内与国际模板在阿里云是分别报备的，不能互相顶用，所以模板只能在这里按
 * 「到岸地区 + 场景」解析，不能由调用方传具体模板 CODE。
 */
export type SmsScene = "verify" | "reset";

/** 国内模板选择（仅 +86 使用）：reset 场景优先专用模板，未配置则回落默认模板 */
function resolveDomesticTemplateCode(scene: SmsScene): string {
  return scene === "reset" ? SMS_TEMPLATE_CODE_RESET || SMS_TEMPLATE_CODE : SMS_TEMPLATE_CODE;
}

/**
 * 构造国际短信正文（纯函数，便于单测）。
 * 模板优先级：env 覆盖（SMS_INTL_MESSAGE_VERIFY/RESET）→ 内置英文默认文案；
 * 所有模板里的 `{code}` 占位符都会被替换。
 */
export function buildIntlSmsMessage(
  scene: SmsScene,
  code: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const custom =
    scene === "reset" ? env.SMS_INTL_MESSAGE_RESET?.trim() : env.SMS_INTL_MESSAGE_VERIFY?.trim();
  const template = custom || INTL_SMS_DEFAULTS[scene];
  return template.replace(/\{code\}/g, String(code));
}

/** 国际短信 Sender ID（可选）：未配置时由阿里云使用默认 Sender ID */
export function intlSmsSenderIdOf(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const id = env.SMS_INTL_SENDER_ID?.trim();
  return id || undefined;
}

/** 阿里云国内 SMS 客户端最小结构（仅消费 sendSms，规避 SDK 类型面） */
interface AliyunSmsClient {
  sendSms(request: unknown): Promise<{ body?: { code?: string; message?: string } }>;
}

/** 阿里云国际 SMS 客户端最小结构（仅消费 sendMessageToGlobe） */
interface AliyunIntlSmsClient {
  sendMessageToGlobe(request: unknown): Promise<{
    body?: { responseCode?: string; responseDescription?: string; messageId?: string; segments?: string };
  }>;
}

// 阿里云客户端懒加载单例（国内 / 国际分开）
let _aliyunClient: AliyunSmsClient | null = null;
let _aliyunIntlClient: AliyunIntlSmsClient | null = null;

/** 是否已配置短信服务（mock 模式始终可用） */
export function isSmsConfigured(): boolean {
  if (SMS_PROVIDER === "mock") return true;
  return Boolean(SMS_ACCESS_KEY_ID && SMS_ACCESS_KEY_SECRET);
}

/** 获取或创建阿里云国内 SMS 客户端（dysmsapi 2017-05-25） */
async function getAliyunClient(): Promise<AliyunSmsClient> {
  if (_aliyunClient) return _aliyunClient;

  try {
    const Dysmsapi = await import("@alicloud/dysmsapi20170525");
    const OpenApi = await import("@alicloud/openapi-client");

    const config = new OpenApi.Config({
      accessKeyId: SMS_ACCESS_KEY_ID,
      accessKeySecret: SMS_ACCESS_KEY_SECRET,
      endpoint: "dysmsapi.aliyuncs.com",
    });
    // ESM import: .default 即为 Client 构造函数（CJS module.exports 的映射）
    const Client = Dysmsapi.default;
    _aliyunClient = new Client(config);
    return _aliyunClient;
  } catch (err) {
    throw new Error(`SMS_SDK_INIT_FAILED: ${(err as Error).message}`, { cause: err });
  }
}

/** 获取或创建阿里云国际/港澳台 SMS 客户端（Dysmsapi 2018-05-01 国际 API） */
async function getAliyunIntlClient(): Promise<AliyunIntlSmsClient> {
  if (_aliyunIntlClient) return _aliyunIntlClient;

  try {
    const Dysmsapi = await import("@alicloud/dysmsapi20180501");
    const OpenApi = await import("@alicloud/openapi-client");

    const config = new OpenApi.Config({
      accessKeyId: SMS_ACCESS_KEY_ID,
      accessKeySecret: SMS_ACCESS_KEY_SECRET,
      endpoint: SMS_INTL_ENDPOINT,
    });
    const Client = Dysmsapi.default;
    _aliyunIntlClient = new Client(config);
    return _aliyunIntlClient;
  } catch (err) {
    throw new Error(`SMS_INTL_SDK_INIT_FAILED: ${(err as Error).message}`, { cause: err });
  }
}

/**
 * 发送国际/港澳台验证码（SendMessageToGlobe：无签名/模板，Sender ID + 正文）。
 * @returns 验证码明文（与传入一致）
 */
async function sendIntlSms(input: {
  phone: string;
  scene: SmsScene;
  code: string;
}): Promise<string> {
  const client = await getAliyunIntlClient();
  const Dysmsapi = await import("@alicloud/dysmsapi20180501");

  const request = new Dysmsapi.SendMessageToGlobeRequest({
    to: smsTargetOf(input.phone), // 国际区号+号码，不带 +
    ...(SMS_INTL_SENDER_ID ? { from: SMS_INTL_SENDER_ID } : {}),
    message: buildIntlSmsMessage(input.scene, input.code),
    type: "OTP",
    validityPeriod: INTL_VALIDITY_SECONDS,
  });

  try {
    const response = await client.sendMessageToGlobe(request);
    const body = response.body;
    if (body?.responseCode === "OK") {
      console.log(
        `[SMS-ALIYUN-INTL] ✓ 国际验证码发送成功: ${maskPhone(input.phone)}` +
          (body.messageId ? `（messageId=${body.messageId}）` : ""),
      );
      return input.code;
    }
    throw new Error(
      `SMS_SEND_FAILED: ${body?.responseDescription || body?.responseCode || "unknown"}`,
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message?.startsWith("SMS_")) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`SMS_SEND_ERROR: ${msg}`, { cause: err });
  }
}

/**
 * 发送短信验证码
 * 支持两种模式：
 *   1. 调用方预生成 code 并传入 → 直接使用该 code 发送（调用方负责存库）
 *   2. 不传 code → 本函数内部生成（仅 mock 模式或旧调用路径兼容）
 *
 * @param phone - 目标手机号（E.164）
 * @param scene - 短信场景（verify / reset），号码归属决定国内/国际通道
 * @param preGeneratedCode - 调用方预生成的验证码（推荐传入，确保发送与存储一致）
 * @returns 验证码明文（调用方需存入数据库）
 */
export async function sendSmsVerificationCode(
  phone: string,
  scene: SmsScene = "verify",
  preGeneratedCode?: string,
): Promise<string> {
  // 优先使用调用方预生成的验证码，确保发送内容与数据库存储一致
  const code = preGeneratedCode;

  if (SMS_PROVIDER === "mock") {
    // Mock 模式：如未传入预生成码则自行生成，打印到控制台
    const mockCode = code || String(crypto.randomInt(100000, 1000000));
    const region = isMainlandE164(phone) ? "国内" : "国际";
    console.log(`[SMS-MOCK] → ${phone}（${region}）: 验证码 ${mockCode}`);
    return mockCode;
  }

  if (!isSmsConfigured()) {
    throw new Error("SMS_NOT_CONFIGURED");
  }

  // 如未传入预生成码，自行生成（兼容旧调用路径，但调用方应确保与存库一致）
  const finalCode = code || String(crypto.randomInt(100000, 1000000));

  // 按号码归属选择通道：+86 走国内签名/模板；其余走国际/港澳台 API（Sender ID + 正文）
  if (!isMainlandE164(phone)) {
    return sendIntlSms({ phone, scene, code: finalCode });
  }

  const client = await getAliyunClient();
  const Dysmsapi = await import("@alicloud/dysmsapi20170525");

  const request = new Dysmsapi.SendSmsRequest({
    phoneNumbers: smsTargetOf(phone),
    signName: SMS_SIGN_NAME,
    templateCode: resolveDomesticTemplateCode(scene),
    templateParam: JSON.stringify({ code: finalCode }),
  });

  try {
    const response = await client.sendSms(request);
    const body = response.body;

    if (body?.code === "OK") {
      console.log(`[SMS-ALIYUN] ✓ 验证码发送成功: ${maskPhone(phone)}`);
      return finalCode;
    }

    throw new Error(`SMS_SEND_FAILED: ${body?.message || body?.code || "unknown"}`);
  } catch (err: unknown) {
    if (err instanceof Error && err.message?.startsWith("SMS_")) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`SMS_SEND_ERROR: ${msg}`, { cause: err });
  }
}

/** 通知类短信是否可用（需在阿里云申请通知模板并配置 SMS_TEMPLATE_CODE_NOTICE） */
export function isSmsNoticeConfigured(): boolean {
  return Boolean(process.env.SMS_TEMPLATE_CODE_NOTICE) && isSmsConfigured();
}

/**
 * 发送通知类短信（非验证码场景，如注销结果）。
 * 仅支持中国大陆号码；模板参数以 {status, name} 形式传入，具体占位符以阿里云模板为准。
 * 未配置模板时返回 false，由调用方降级（邮件/标记跳过）。
 */
export async function sendSmsNotice(phone: string, params: Record<string, string>): Promise<boolean> {
  const templateCode = process.env.SMS_TEMPLATE_CODE_NOTICE;
  if (!templateCode || !isMainlandE164(phone) || !isSmsConfigured()) return false;
  const client = await getAliyunClient();
  const Dysmsapi = await import("@alicloud/dysmsapi20170525");
  const request = new Dysmsapi.SendSmsRequest({
    phoneNumbers: smsTargetOf(phone),
    signName: SMS_SIGN_NAME,
    templateCode,
    templateParam: JSON.stringify(params),
  });
  const response = await client.sendSms(request);
  return response.body?.code === "OK";
}
