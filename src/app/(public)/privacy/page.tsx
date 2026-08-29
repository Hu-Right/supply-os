/**
 * /privacy — 隐私政策
 * Privacy Policy
 *
 * 版本：V1.0  生效日期：2026年8月29日
 * 运营主体：杭州云境智展科技有限公司
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "隐私政策 — OS NEO SMART",
  description: "OS NEO SMART 隐私政策（Privacy Policy），版本 V1.0",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-10 text-sm leading-relaxed text-slate-700">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-bold text-slate-900">OS NEO SMART 隐私政策</h1>
        <p className="mt-1 text-xs text-slate-500">
          版本：V1.0 &nbsp;|&nbsp; 生效日期：2026年8月29日 &nbsp;|&nbsp; 运营主体：杭州云境智展科技有限公司
        </p>
      </header>

      <section className="mb-6 rounded-lg bg-teal-50 border border-teal-200 p-4 text-xs text-teal-800">
        <strong>政策摘要：</strong>我们遵循合法、正当、必要、诚信和最小必要原则处理个人信息，
        并向用户提供查阅、复制、更正、补充、删除、撤回同意、注销账号等权利行使渠道。
      </section>

      <div className="space-y-6">
        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-2">1. 我们是谁及本政策适用范围</h2>
          <p>
            本政策适用于杭州云境智展科技有限公司运营的 OS NEO SMART 网站（osneosmart.com）
            以及明确引用本政策的相关网页、账户系统、会员服务和在线功能。
          </p>
          <p className="mt-2">
            本政策解释我们如何收集、存储、使用、加工、传输、提供、公开和删除个人信息。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-2">2. 我们处理个人信息的基本原则</h2>
          <p>
            我们按照明确、合理的目的处理个人信息，并仅处理与目的直接相关的最小范围信息；
            不通过误导、欺诈或胁迫方式取得同意。
          </p>
          <p className="mt-2">
            基于同意处理时，您的同意应在充分知情前提下自愿、明确作出。
            法律要求单独同意或书面同意的，我们将按要求取得。
          </p>
          <p className="mt-2">
            对于提供核心服务非必要的信息，您有权拒绝提供；
            除法律另有规定或该信息确属提供相应功能所必需外，
            我们不会仅因您不同意额外处理而拒绝提供基本服务。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-2">3. 我们收集哪些个人信息</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-50">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-bold">场景</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-bold">信息类型</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-bold">目的</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border-b border-slate-100 px-3 py-2">账号注册/登录</td>
                  <td className="border-b border-slate-100 px-3 py-2">手机号或邮箱、验证码/密码、账号ID、登录时间/IP</td>
                  <td className="border-b border-slate-100 px-3 py-2">创建账号、身份验证</td>
                </tr>
                <tr>
                  <td className="border-b border-slate-100 px-3 py-2">企业账号/认证</td>
                  <td className="border-b border-slate-100 px-3 py-2">企业名称、联系人、营业执照</td>
                  <td className="border-b border-slate-100 px-3 py-2">建立企业档案</td>
                </tr>
                <tr>
                  <td className="border-b border-slate-100 px-3 py-2">采购检索与匹配</td>
                  <td className="border-b border-slate-100 px-3 py-2">搜索词、类目、收藏、浏览记录</td>
                  <td className="border-b border-slate-100 px-3 py-2">提供搜索、推荐</td>
                </tr>
                <tr>
                  <td className="border-b border-slate-100 px-3 py-2">购买/会员</td>
                  <td className="border-b border-slate-100 px-3 py-2">订单号、金额、支付状态</td>
                  <td className="border-b border-slate-100 px-3 py-2">完成交易、退款</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">网站安全</td>
                  <td className="px-3 py-2">IP、浏览器、Cookie</td>
                  <td className="px-3 py-2">安全防护</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-2">4. Cookie、日志与类似技术</h2>
          <p>
            为维持登录状态、账号安全、语言/界面偏好和基础功能，我们可能使用必要 Cookie 或本地存储。
            非必要 Cookie（如分析、营销类）将按适用法律法规要求提供选择机制。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-2">5. 您的权利</h2>
          <p>您可以在个人中心或通过联系我们行使以下权利：</p>
          <ul className="mt-2 ml-4 list-disc space-y-1">
            <li><strong>查阅</strong>：查看平台正在处理的本人账号资料</li>
            <li><strong>复制</strong>：申请复制本人个人信息</li>
            <li><strong>更正与补充</strong>：修改错误、不准确或不完整的个人信息</li>
            <li><strong>删除</strong>：在法定情形下请求删除相关个人信息</li>
            <li><strong>撤回同意</strong>：撤回基于同意的信息处理</li>
            <li><strong>关闭营销信息</strong>：退订短信、邮件等营销通知</li>
            <li><strong>账号注销</strong>：申请注销账号</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-2">6. 跨境数据传输</h2>
          <p>
            如存在境内个人信息出境情形，我们将根据《促进和规范数据跨境流动规定》及最新监管要求，
            建立相应的法律机制（标准合同、认证或安全评估）。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-2">7. 联系我们</h2>
          <p>
            如对本政策有任何疑问、投诉或建议，请联系：<br />
            邮箱：support@osneosmart.com<br />
            网站：osneosmart.com
          </p>
        </section>
      </div>

      <footer className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-400">
        <p>© 2026 杭州云境智展科技有限公司 &nbsp;|&nbsp; osneosmart.com</p>
        <p className="mt-1">本政策最终解释权归平台运营方所有。如中英文版本存在差异，以中文版本为准。</p>
      </footer>
    </article>
  );
}
