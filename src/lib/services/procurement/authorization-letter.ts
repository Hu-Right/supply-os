/**
 * 授权书（采购需求发布与供应商智能匹配授权书，中英双语）—— 服务端入口
 * @module lib/services/procurement/authorization-letter
 *
 * @description 七步流程第 4/5 步：项目提交（版本确认）后，系统按「需求编号 + 版本」
 *              生成授权书，采购方签字盖章（扫描件上传）并在线确认。授权与版本绑定——
 *              version_no 变更即失效须重签（授权书第五条：重大实质性变更须重新确认授权）。
 *              legal_hash 是"签署所依据的授权书内容"的指纹，签署与核验两侧比对同一指纹。
 *
 *              2026-11 拆分：正文与常量移到 `shared/constants/procurement-authorization-letter`
 *              （客户端发布页要直接渲染/打印正文，而本模块带 `node:crypto`，整模块进客户端
 *              会把 node 内置模块打进浏览器包）。本文件保留原导出面（re-export），
 *              `computeLetterHash` 留在服务端，调用方 import 路径无需改动。
 */
import { createHash } from "node:crypto";
import { AUTH_LETTER_TEMPLATE_VERSION, type AuthorizationLetterInput } from "@/shared/constants/procurement-authorization-letter";

export {
  AUTH_LETTER_NOTE,
  AUTH_LETTER_TEMPLATE_VERSION,
  AUTHORIZED_PARTY_EN,
  AUTHORIZED_PARTY_ZH,
  buildLetterSections,
} from "@/shared/constants/procurement-authorization-letter";
export type { AuthorizationLetterInput, LetterSection } from "@/shared/constants/procurement-authorization-letter";

/**
 * 授权书内容哈希：canonical JSON（键序固定）+ sha256。
 * 打印页与在线确认端点共用同一函数，两侧哈希一致才算"签署了同一份授权书"。
 */
export function computeLetterHash(input: AuthorizationLetterInput): string {
  const canonical = JSON.stringify({
    templateVersion: AUTH_LETTER_TEMPLATE_VERSION,
    reference: input.reference,
    versionNo: input.versionNo,
    buyerOrgName: input.buyerOrgName,
    projectTitle: input.projectTitle,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
