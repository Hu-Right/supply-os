/**
 * 短信发送服务
 * SMS Service
 *
 * @module server/services/sms
 * @description 发送短信验证码。支持 mock 模式（控制台打印）与阿里云 SMS。
 *              阿里云模式下，验证码由我们生成并通过阿里云短信服务发送。
 *              环境变量缺失时优雅降级，抛出明确错误供上层处理。
 */

import crypto from "crypto";
import { maskPhone } from "../utils/mask";

const SMS_PROVIDER = process.env.SMS_PROVIDER || "mock"; // "mock" | "aliyun"
const SMS_ACCESS_KEY_ID = process.env.SMS_ACCESS_KEY_ID;
const SMS_ACCESS_KEY_SECRET = process.env.SMS_ACCESS_KEY_SECRET;
const SMS_SIGN_NAME = process.env.SMS_SIGN_NAME || "恒创联众";
const SMS_TEMPLATE_CODE = process.env.SMS_TEMPLATE_CODE || "100001"; // 默认模板（绑定/解绑/换绑）
const SMS_TEMPLATE_CODE_RESET = process.env.SMS_TEMPLATE_CODE_RESET; // 找回密码专用模板

/** 获取找回密码专用模板 CODE */
export function getSmsResetTemplateCode(): string | undefined {
  return SMS_TEMPLATE_CODE_RESET;
}

// 阿里云客户端懒加载单例
let _aliyunClient: any = null;

/** 是否已配置短信服务（mock 模式始终可用） */
export function isSmsConfigured(): boolean {
  if (SMS_PROVIDER === "mock") return true;
  return Boolean(SMS_ACCESS_KEY_ID && SMS_ACCESS_KEY_SECRET);
}

/** 获取或创建阿里云 SMS 客户端（dysmsapi — 短信服务） */
async function getAliyunClient(): Promise<any> {
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

/**
 * 发送短信验证码
 * 支持两种模式：
 *   1. 调用方预生成 code 并传入 → 直接使用该 code 发送（调用方负责存库）
 *   2. 不传 code → 本函数内部生成（仅 mock 模式或旧调用路径兼容）
 *
 * @param phone - 目标手机号（中国大陆 11 位）
 * @param templateCode - 可选模板 CODE，未传则使用默认模板
 * @param preGeneratedCode - 调用方预生成的验证码（推荐传入，确保发送与存储一致）
 * @returns 验证码明文（调用方需存入数据库）
 */
export async function sendSmsVerificationCode(
  phone: string,
  templateCode?: string,
  preGeneratedCode?: string,
): Promise<string> {
  // 优先使用调用方预生成的验证码，确保发送内容与数据库存储一致
  const code = preGeneratedCode;

  if (SMS_PROVIDER === "mock") {
    // Mock 模式：如未传入预生成码则自行生成，打印到控制台
    const mockCode = code || String(crypto.randomInt(100000, 1000000));
    console.log(`[SMS-MOCK] → ${phone}: 验证码 ${mockCode}`);
    return mockCode;
  }

  if (!isSmsConfigured()) {
    throw new Error("SMS_NOT_CONFIGURED");
  }

  // 如未传入预生成码，自行生成（兼容旧调用路径，但调用方应确保与存库一致）
  const finalCode = code || String(crypto.randomInt(100000, 1000000));

  // 优先使用传入的模板 CODE，否则使用默认模板
  const tplCode = templateCode || SMS_TEMPLATE_CODE;

  // 阿里云 SMS 发送（dysmsapi — 短信服务）
  const client = await getAliyunClient();
  const Dysmsapi = await import("@alicloud/dysmsapi20170525");

  const request = new Dysmsapi.SendSmsRequest({
    phoneNumbers: phone,
    signName: SMS_SIGN_NAME,
    templateCode: tplCode,
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
  } catch (err: any) {
    if (err.message?.startsWith("SMS_")) throw err;
    throw new Error(`SMS_SEND_ERROR: ${err.message}`, { cause: err });
  }
}
