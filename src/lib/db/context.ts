/**
 * 应用上下文 / Application Context
 * @module lib/db/context
 * @description 按业务域拆分的领域上下文。统一使用领域上下文（如 ctx.notice.detailRepo）。
 *              从 server/context.ts 复制，新增 getContext() 工厂函数（原逻辑在 bootstrap.ts 中）。
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { getPool } from "./pool";
import { PaymentService } from "../payment/PaymentService";
import { LearningPaymentService } from "../payment/learning-payment";
import { ServicePaymentService } from "../payment/service-payment";
import { TrainingPaymentService } from "../payment/TrainingPaymentService";
import { PaymentOrchestrator } from "../payment/orchestrator";
import { MockProvider } from "../payment/MockProvider";
import { AlipayProvider } from "../payment/AlipayProvider";
import { WechatProvider } from "../payment/WechatProvider";
import { isParseablePrivateKey } from "../payment/keys";
import { UsersRepo } from "../repos/users.repo";
import { AuthRepo } from "../repos/auth.repo";
import { BenefitSystemRepo } from "../repos/benefit-system.repo";
import { BenefitWriteRepo } from "../repos/benefit-write.repo";
import { PaymentsRepo } from "../repos/payments.repo";
import { PaymentHistoryRepo } from "../repos/payment-history.repo";
import { LearningOrdersRepo } from "../repos/learning-orders.repo";
import { ServiceOrdersRepo } from "../repos/service-orders.repo";
import { LearningMaterialsRepo } from "../repos/learning-materials.repo";
import { OpportunitiesRepo } from "../repos/opportunities.repo";
import {
  NoticeDetailRepo,
  NoticeAccessGrantRepo,
  NoticeTranslationRepo,
  NoticeInteractionRepo,
  NoticeFeedbackRepo,
  NoticeFavoriteRepo,
} from "../repos/notices/index";
import {
  SupplierDirectoryRepo,
  SupplierClaimRepo,
} from "../repos/suppliers/index";
import { IndustryNodeRepo } from "../repos/industry-node.repo";
import { CatalogRepo } from "../repos/catalog.repo";
import { OpenApiRepo } from "../repos/open-api.repo";
import { AwardsRepo } from "../repos/awards.repo";
import { KeywordGroupsRepo } from "../repos/keyword-groups.repo";
import { OfficialKeywordGroupsRepo } from "../repos/official-keyword-groups.repo";
import { LeadsRepo } from "../repos/leads.repo";
import { InvitationRepo } from "../repos/invitation.repo";
import { EcoPartnerRepo } from "../repos/eco-partner.repo";
import { ChatRepo } from "../repos/chat.repo";
import { TrainingRepo, SystemRepo } from "../repos/training.repo";

/** 公告域上下文 */
export type NoticeContext = {
  dbPool: Pool;
  detailRepo: NoticeDetailRepo;
  accessGrantRepo: NoticeAccessGrantRepo;
  translationRepo: NoticeTranslationRepo;
  interactionRepo: NoticeInteractionRepo;
  feedbackRepo: NoticeFeedbackRepo;
  favoriteRepo: NoticeFavoriteRepo;
};

/** 支付域上下文 */
export type PaymentContext = {
  dbPool: Pool;
  paymentService: PaymentService;
  learningPaymentService: LearningPaymentService;
  trainingPaymentService: TrainingPaymentService; // ARCH-PN 新增
  orchestrator: PaymentOrchestrator;
  paymentMode: "live" | "mock";
  paymentsRepo: PaymentsRepo;
  learningOrdersRepo: LearningOrdersRepo;
  servicePaymentService: ServicePaymentService;
  serviceOrdersRepo: ServiceOrdersRepo;
  paymentHistoryRepo: PaymentHistoryRepo;
};

/** 用户域上下文 */
export type UserContext = {
  dbPool: Pool;
  usersRepo: UsersRepo;
  authRepo: AuthRepo;
  keywordGroupsRepo: KeywordGroupsRepo;
  invitationRepo: InvitationRepo;
};

/** 供应商域上下文 */
export type SupplierContext = {
  dbPool: Pool;
  directoryRepo: SupplierDirectoryRepo;
  claimRepo: SupplierClaimRepo;
  /** 行业面（industry_nodes + 挂靠表）读层：门户把行业码翻成双语标签与筛选项的唯一入口 */
  industryRepo: IndustryNodeRepo;
};

export type AppContext = {
  dbPool: Pool;
  notice: NoticeContext;
  payment: PaymentContext;
  user: UserContext;
  supplier: SupplierContext;
  /** 权益体系新表组（benefit_catalog / crm_plan_* / benefit_quotas）读层 */
  benefitSystemRepo: BenefitSystemRepo;
  /** 权益体系写层：订阅事实 + 额度账本（plan_subscriptions / benefit_quotas） */
  benefitWriteRepo: BenefitWriteRepo;
  opportunitiesRepo: OpportunitiesRepo;
  catalogRepo: CatalogRepo;
  openApiRepo: OpenApiRepo;
  awardsRepo: AwardsRepo;
  leadsRepo: LeadsRepo;
  /** 第三方服务生态伙伴只读层（eco_partner，迁移 062；写路径归运营侧，门户只读） */
  ecoPartnerRepo: EcoPartnerRepo;
  chatRepo: ChatRepo;
  trainingRepo: TrainingRepo;
  systemRepo: SystemRepo;
  /** 官方精选词组只读投影（official_keyword_groups，后台维护，本项目无写路径） */
  officialKeywordGroupsRepo: OfficialKeywordGroupsRepo;
};

/** 开发态 HMR 兜底版本：globalThis 单例持有的是旧 repo 实例，新增 repo 方法在热更新后不生效；
 *  版本号变更时强制重建（生产单次启动无影响）。修改上下文中 repo 的方法/形状时 +1。
 *  2026-11-16 +1：SupplierDirectoryRepo 的门户列白名单摘掉已删列（business_type /
 *  business_type_code / source_channel 等）。旧实例仍在 globalThis 里，拼出的 SELECT
 *  含已删列 → ERP2005「Unknown column 'business_type' in 'field list'」，
 *  企业信息 GET 与供应商列表直接 500；不 +1 就得重启 dev 才能恢复。
 *  同理：任何「列白名单 / 静态列集合」变更都算形状变更，必须 +1。
 *  2026-11-17 +1：迁移 040 摘除 supplier.intro，SupplierDirectoryRepo 的
 *  EDITABLE_COLUMNS/PORTAL_COLUMNS 同步删列；不 +1 时已绑定企业的账号
 *  GET /api/user/enterprise 仍拼 `intro` → Unknown column → 500。
 *  2026-11-18 +1：迁移 050 给 supplier 加 credit_code_type/credit_code_norm，
 *  白名单（PORTAL/EDITABLE）随之加列；不 +1 时 dev 热重载仍按旧列集合拼 SQL。
 *  2026-11-19 +1：证书改单一事实源（能力档案），certification 移出 EDITABLE_COLUMNS
 *  停止写入；旧上下文仍带该列，保存时会继续写历史列，必须让缓存失效。
 *  2026-11-19 +1（供应商企业主页改版）：SupplierDirectoryRepo 新增 findSimilarReviewed，
 *  且 findById 列集合扩展；旧实例无新方法会让相似供应商整段静默缺席。
 *  2026-11-19 +1（画像品目）：SupplierDirectoryRepo 新增 findBackboneInterests；
 *  旧单例缺该方法会让「平台归类」静默不渲染。
 *  2026-11-19 +1（相似供应商 v2）：SupplierDirectoryRepo 新增
 *  findReviewedByBackboneCodes / findReviewedByIndustryPrefix / findBackboneInterestsBySupplierIds；
 *  旧单例缺方法会让相似推荐整段退化为空。
 *  2026-11-19 +1（分享卡）：NoticeDetailRepo 新增 findShareCardFromPublic；
 *  旧单例缺方法会让 OG 图数据读取抛 not a function、只能退回通用卡。
 *  2026-11-20 +1（第三方服务生态）：AppContext 新增 ecoPartnerRepo（迁移 062 建 eco_partner）；
 *  旧单例缺该方法会让 /api/eco-partners 抛 not a function。
 *  2026-11-20 +1（采购 P0）：procurement_projects 新增 method 列并进入项目视图列集合（迁移 063），
 *  旧单例的静态列集合会漏列。 */
const CTX_VERSION = 17;

const globalForCtx = globalThis as unknown as {
  _appCtx?: AppContext & { __ctxVersion?: number };
};

/**
 * 构建并缓存完整的 AppContext（globalThis 单例）。
 * 在 instrumentation.ts 的 6 阶段完成后调用。
 */
export function getContext(): AppContext {
  const cached = globalForCtx._appCtx;
  if (cached && cached.__ctxVersion === CTX_VERSION) return cached;

  const dbPool = getPool();
  const paymentMode = (process.env.PAYMENT_MODE || "mock") as "live" | "mock";

  const usersRepo = new UsersRepo(dbPool);
  const authRepo = new AuthRepo(dbPool);
  const paymentsRepo = new PaymentsRepo(dbPool);
  const paymentHistoryRepo = new PaymentHistoryRepo(dbPool);
  const learningOrdersRepo = new LearningOrdersRepo(dbPool);
  const serviceOrdersRepo = new ServiceOrdersRepo(dbPool);
  const learningMaterialsRepo = new LearningMaterialsRepo(dbPool);
  const opportunitiesRepo = new OpportunitiesRepo(dbPool);

  const detailRepo = new NoticeDetailRepo(dbPool);
  const accessGrantRepo = new NoticeAccessGrantRepo(dbPool);
  const translationRepo = new NoticeTranslationRepo(dbPool);
  const interactionRepo = new NoticeInteractionRepo(dbPool);
  const feedbackRepo = new NoticeFeedbackRepo(dbPool);
  const favoriteRepo = new NoticeFavoriteRepo(dbPool);

  const directoryRepo = new SupplierDirectoryRepo(dbPool);
  const claimRepo = new SupplierClaimRepo(dbPool);
  const industryRepo = new IndustryNodeRepo(dbPool);

  const catalogRepo = new CatalogRepo(dbPool);
  const benefitSystemRepo = new BenefitSystemRepo(dbPool);
  const benefitWriteRepo = new BenefitWriteRepo();
  const openApiRepo = new OpenApiRepo(dbPool);
  const awardsRepo = new AwardsRepo(dbPool);
  const keywordGroupsRepo = new KeywordGroupsRepo(dbPool);
  const officialKeywordGroupsRepo = new OfficialKeywordGroupsRepo(dbPool);
  const invitationRepo = new InvitationRepo(dbPool);
  const leadsRepo = new LeadsRepo(dbPool);
  const ecoPartnerRepo = new EcoPartnerRepo(dbPool);
  const chatRepo = new ChatRepo(dbPool);
  const trainingRepo = new TrainingRepo(dbPool);
  const systemRepo = new SystemRepo(dbPool);

  const paymentService = new PaymentService(paymentsRepo, {
    catalog: benefitSystemRepo,
    write: benefitWriteRepo,
  });
  const learningPaymentService = new LearningPaymentService(learningOrdersRepo, learningMaterialsRepo);
  const servicePaymentService = new ServicePaymentService(serviceOrdersRepo, dbPool);
  const trainingPaymentService = new TrainingPaymentService(trainingRepo); // ARCH-PN 新增
  const orchestrator = new PaymentOrchestrator(paymentService, learningPaymentService, paymentsRepo, learningOrdersRepo, trainingRepo, servicePaymentService, serviceOrdersRepo, paymentHistoryRepo, {
    catalog: benefitSystemRepo,
    write: benefitWriteRepo,
  });

  // ARCH-PN（2026-09-11）：策略注册收归 Orchestrator 统一管理。
  // orchestrator.registerStrategy() 内部自动向 paymentService / learningPaymentService
  // 注入策略解析闭包，无需再分别调用各子服务的 registerStrategy()。
  orchestrator.registerStrategy("mock", new MockProvider());
  if (paymentMode === "live") {
    const alipayAppId = process.env.ALIPAY_APP_ID || "";
    const alipayPrivateKey = process.env.ALIPAY_PRIVATE_KEY || "";
    if (alipayAppId && isParseablePrivateKey(alipayPrivateKey)) {
      orchestrator.registerStrategy(
        "alipay",
        new AlipayProvider({
          appId: alipayAppId,
          privateKey: alipayPrivateKey,
          publicKey: process.env.ALIPAY_PUBLIC_KEY || "",
          notifyUrl: process.env.ALIPAY_NOTIFY_URL || "",
          sandbox: process.env.ALIPAY_SANDBOX === "true",
        }),
      );
    }
    const wechatAppId = process.env.WECHAT_APP_ID || "";
    const wechatMchId = process.env.WECHAT_MCH_ID || "";
    if (wechatAppId && wechatMchId) {
      orchestrator.registerStrategy(
        "wechat",
        new WechatProvider({
          appId: wechatAppId,
          mchId: wechatMchId,
          apiV3Key: process.env.WECHAT_API_V3_KEY || "",
          privateKey: process.env.WECHAT_PRIVATE_KEY || "",
          notifyUrl: process.env.WECHAT_NOTIFY_URL || "",
          sandbox: false,
        }),
      );
    }
  }

  // ARCH-PN（2026-09-11）：培训支付服务策略解析器注入
  // （orchestrator 不直接持有 trainingPaymentService，需在此处手动注入）
  trainingPaymentService.setStrategyResolver({
    getStrategy: (p) => orchestrator.getStrategy(p),
    hasStrategy: (p) => orchestrator.hasStrategy(p),
    paymentMode,
  });

  const ctx: AppContext & { __ctxVersion: number } = {
    dbPool,
    notice: { dbPool, detailRepo, accessGrantRepo, translationRepo, interactionRepo, feedbackRepo, favoriteRepo },
    payment: {
      dbPool, paymentService, learningPaymentService, trainingPaymentService, servicePaymentService, orchestrator, paymentMode,
      paymentsRepo, learningOrdersRepo, serviceOrdersRepo, paymentHistoryRepo,
    },
    user: { dbPool, usersRepo, authRepo, keywordGroupsRepo, invitationRepo },
    supplier: { dbPool, directoryRepo, claimRepo, industryRepo },
    benefitSystemRepo,
    benefitWriteRepo,
    opportunitiesRepo,
    catalogRepo,
    openApiRepo,
    awardsRepo,
    leadsRepo,
    ecoPartnerRepo,
    chatRepo,
    trainingRepo,
    systemRepo,
    officialKeywordGroupsRepo,
    __ctxVersion: CTX_VERSION,
  };

  globalForCtx._appCtx = ctx;
  return ctx;
}

