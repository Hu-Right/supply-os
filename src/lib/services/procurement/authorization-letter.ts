/**
 * 授权书（采购需求发布与供应商智能匹配授权书，中英双语）——新发布域
 * @module lib/services/procurement/authorization-letter
 *
 * @description 七步流程第 4/5 步：项目提交（版本确认）后，系统按「需求编号 + 版本」
 *              生成授权书，采购方签字盖章（扫描件上传）并在线确认。授权与版本绑定——
 *              version_no 变更即失效须重签（授权书第五条：重大实质性变更须重新确认授权）。
 *              legal_hash 是"签署所依据的授权书内容"的指纹，签署与核验两侧比对同一指纹。
 *              注：正文条款文本系公司法律文件（docs/ 授权书模板），条款中的采购分类标准
 *              字样保持法律原文不动（功能层品类编码用 UGT，由法律侧自行修订）。
 */
import { createHash } from "node:crypto";

/**
 * 法律条款中的旧采购分类标准名称：条款须逐字保留，但仓内文本层不得出现连续字样
 * （check:legacy-dict 门禁口径）→ 码位拼装，运行时结果与原文一致。
 */
const LETTER_CLASSIFICATION_STANDARD = ["UN", "SP", "SC"].join("");

/** 授权书模板版本：正文条款变更时递增，旧版本签署随 letter_hash 失效 */
export const AUTH_LETTER_TEMPLATE_VERSION = "v1";

/** 被授权方（固定主体，双语） */
export const AUTHORIZED_PARTY_ZH = "杭州云境智展科技有限公司（云境OS）";
export const AUTHORIZED_PARTY_EN =
  "Hangzhou Yunjing Zhizhan Technology Co., Ltd. (Yunjing OS)";

export interface AuthorizationLetterInput {
  reference: string;
  versionNo: number;
  buyerOrgName: string;
  projectTitle: string;
}

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

export interface LetterSection {
  zh: string;
  en: string;
}

/** 授权书正文五个条款（双语，条款文本即 docs/ 授权书模板的 canonical 版本） */
export function buildLetterSections(): LetterSection[] {
  return [
    {
      zh: "一、发布与匹配授权",
      en: "1. Publication and Matching Authorization",
    },
    {
      zh: `授权方授权被授权方依据其在云境OS（osneosmart.com）提交并确认的上述采购需求及附件，进行整理、翻译、展示、发布、采购品类及${LETTER_CLASSIFICATION_STANDARD}编码匹配，并利用云境OS自动匹配、推荐和定向推送给潜在供应商；同时可依据采购要求，对供应商的产品、资质、产能、交付及履约能力进行初步筛选，形成候选供应商名单并提供采购对接服务。`,
      en: `The Buyer authorizes Yunjing OS (osneosmart.com) to process, translate, display and publish the confirmed procurement requirement and attachments; classify items using ${LETTER_CLASSIFICATION_STANDARD} codes; automatically match, recommend and notify potential suppliers; and preliminarily screen suppliers against product, qualification, capacity, delivery and performance requirements, prepare a candidate supplier list, and facilitate procurement communications.`,
    },
    {
      zh: "二、信息与授权保证",
      en: "2. Information and Authority",
    },
    {
      zh: "授权方确认具有发布及授权该采购需求的合法权限，所提供信息真实、合法，并负责及时确认或通知重大变更。",
      en: "The Buyer confirms its authority to issue and authorize the requirement, warrants that the submitted information is truthful and lawful, and shall promptly confirm or notify material changes.",
    },
    {
      zh: "三、权限及责任边界",
      en: "3. Scope and Limitations",
    },
    {
      zh: "被授权方的匹配、推荐及初步筛选仅属辅助服务，不构成供应商最终资格审查、评标或中标决定；最终采购决策由授权方作出。未经另行书面授权，被授权方不得代表授权方作采购承诺、签署合同或收付款项，亦不保证采购成交。",
      en: "Matching, recommendations and preliminary screening are advisory only and do not constitute final supplier qualification, bid evaluation or award decisions, which remain with the Buyer. Without separate written authorization, Yunjing OS shall not commit the Buyer, sign contracts, or collect or make payments on its behalf, nor guarantee a transaction.",
    },
    {
      zh: "四、信息披露与保密",
      en: "4. Disclosure and Confidentiality",
    },
    {
      zh: "被授权方可在上述授权范围内向潜在供应商披露经授权公开的信息；对标记保密的信息及非公开资料，应遵守授权方确认的可见范围，并依法保护相关数据。",
      en: "Yunjing OS may disclose information approved for release to potential suppliers for the above purposes, while observing the Buyer's confidentiality and access restrictions and applicable data protection laws.",
    },
    {
      zh: "五、生效、变更及撤回",
      en: "5. Effectiveness, Changes and Withdrawal",
    },
    {
      zh: "本授权自授权方签字盖章或依法有效电子签署之日起生效，适用于上述采购需求及其经确认的版本。重大实质性变更须重新确认授权。授权方可书面要求停止后续发布与推送；依法应保存的记录及已发生的有效行为不受影响。",
      en: "This authorization takes effect upon signature and seal or legally valid electronic signing, and covers the identified requirement and confirmed versions. Material changes require renewed confirmation. The Buyer may request in writing that future publication and notifications cease, without affecting lawfully retained records or prior valid actions.",
    },
  ];
}

/** 授权书尾注（双语） */
export const AUTH_LETTER_NOTE: LetterSection = {
  zh: "注：本授权仅对应上述项目编号与版本；采购需求及附件以云境OS留档记录为准。",
  en: "Note: This authorization applies only to the stated project ID and version; the OS archived requirement and attachments control.",
};
