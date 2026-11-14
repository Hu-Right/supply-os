// i18n-allow-file: 代理采购授权委托书为双语法律文本（中文法律版为准），不随界面语言切换
"use client";

/**
 * /settings/buyer/agent-letter — 代理采购授权委托书（在线填写/打印/另存 PDF）
 *
 * @module app/(public)/settings/buyer/agent-letter/page
 * @description 解决 F01 第 7 项「授权证明」的现实缺口：代理采购方通常没有现成委托书。
 *              本页按当前采购主体预填「受托方名称 + BUYER-ID」，委托方信息留空由线下填写；
 *              支持浏览器打印/另存 PDF，签字盖章后回到认证页上传扫描件。
 *              页面同时提供 Word/PDF 模板下载（public/downloads/templates）。
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/core/http";

interface BuyerInfo {
  orgName: string;
  buyerNo: string;
  regNo: string;
  country: string;
  address: string;
}

const LINE = "____________________________________________";

function fmtDate(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function AgentLetterPage() {
  const [buyer, setBuyer] = useState<BuyerInfo | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api<{ buyer: BuyerInfo | null }>("/api/procurement/buyer");
      setBuyer(r.buyer);
      if (!r.buyer) setLoadError("尚未登记采购主体，请先完成主体信息后打印本委托书。");
    } catch (err) {
      setLoadError((err as Error).message || "加载失败");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="print:hidden mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-secondary-200 bg-white p-4 shadow-xs">
        <div className="text-sm text-secondary-700">
          <span className="font-semibold">代理采购授权委托书</span>
          <span className="ml-2 text-xs text-secondary-400">打印后由委托方（最终采购方）盖章、签字，扫描件回传认证页</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => window.print()} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white">
            打印 / 另存 PDF
          </button>
          <Link href="/settings/buyer" className="rounded-lg border border-secondary-300 px-4 py-2 text-sm font-semibold text-secondary-600">
            返回认证页
          </Link>
        </div>
      </div>

      <div className="print:hidden mb-4 rounded-2xl border border-secondary-200 bg-secondary-50 px-4 py-3 text-xs text-secondary-600">
        也可直接下载模板：
        <a className="mx-1 text-teal-700 underline" href="/downloads/templates/procurement-agent-authorization-template.docx" download>
          Word 可编辑版
        </a>
        <a className="mx-1 text-teal-700 underline" href="/downloads/templates/procurement-agent-authorization-template.pdf" download>
          PDF 打印版
        </a>
        <span className="mx-1 text-secondary-400">（模板为通用格式，条款可按委托方制度调整）</span>
      </div>

      {loadError && <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 print:hidden">{loadError}</div>}

      <div className="rounded-2xl border border-secondary-200 bg-white p-8 shadow-xs print:border-0 print:shadow-none">
        <h1 className="text-center text-xl font-extrabold text-secondary-900">代理采购授权委托书</h1>
        <p className="text-center text-sm text-secondary-600">Power of Attorney for Procurement</p>

        <div className="mt-6 space-y-2 text-sm leading-relaxed text-secondary-800">
          <p className="font-semibold">委托方（最终采购方 / 项目业主）：{LINE}</p>
          <p className="text-secondary-500">Principal (End Buyer / Project Owner): {LINE}</p>
          <p>注册号：{LINE} 地址：{LINE}</p>
          <p className="text-secondary-500">Registration No.: {LINE}  Address: {LINE}</p>
          <p>联系人 / 电话 / 邮箱：{LINE}</p>
          <p className="text-secondary-500">Contact / Tel / Email: {LINE}</p>

          <p className="mt-4 font-semibold">受托方（代理采购方）：{buyer?.orgName || LINE}</p>
          <p className="text-secondary-500">Agent (Authorized Procurement Party): {buyer?.orgName || LINE}</p>
          <p>采购主体编号（云境OS Buyer ID）：{buyer?.buyerNo || "BUY-______-__________"}</p>
          <p className="text-secondary-500">Buyer ID on Yunjing OS: {buyer?.buyerNo || "BUY-______-__________"}</p>
        </div>

        <div className="mt-6 space-y-2 text-sm leading-relaxed text-secondary-800">
          <h2 className="font-bold">一、授权事项</h2>
          <p>委托方兹授权受托方，就下列采购事项，以受托方名义在云境OS（osneosmart.com）代表委托方办理：</p>
          <p>1. 发布采购需求及附件，并对需求内容进行确认、修改与澄清；</p>
          <p>2. 接收、整理供应商响应文件，组织答疑；</p>
          <p>3. 组织评审并确认采购结果（如勾选：□ 是 □ 否）；</p>
          <p>4. 与云境OS对接，授权其按《采购需求发布与供应商智能匹配授权书》发布需求并匹配供应商。</p>
          <p>采购项目名称 / 编号（可留空，适用于长期代理）：{LINE}</p>

          <h2 className="mt-4 font-bold text-secondary-600">1. Scope of Authorization</h2>
          <p className="text-secondary-500">The Principal hereby authorizes the Agent, in the Agent&apos;s own name on Yunjing OS (osneosmart.com), to publish the procurement requirement and attachments and to confirm, amend and clarify them; to receive and organize supplier responses and manage clarifications; to organize evaluation and confirm the award result (tick if applicable: □ Yes □ No); and to coordinate with Yunjing OS so that it may publish the requirement and match suppliers under the Authorization for Publication of Procurement Requirements and Supplier Matching.</p>
        </div>

        <div className="mt-6 space-y-2 text-sm leading-relaxed text-secondary-800">
          <h2 className="font-bold">二、权限边界</h2>
          <p>1. 受托方应在上述范围内行使代理权，不得转委托；</p>
          <p>2. 涉及合同签署、收付款、放弃权利或变更实质性条件，须经委托方另行书面授权；</p>
          <p>3. 受托方在平台提交的信息应真实、合法，委托方对其授权范围内的行为承担相应责任。</p>
          <h2 className="mt-4 font-bold text-secondary-600">2. Limitations</h2>
          <p className="text-secondary-500">The Agent shall act only within the scope above and may not sub-delegate. Signing contracts, making or receiving payments, waiving rights or changing material terms require separate written authorization. Information submitted by the Agent on the platform shall be true and lawful, and the Principal bears corresponding responsibility for acts within the scope of this authorization.</p>
        </div>

        <div className="mt-6 space-y-2 text-sm leading-relaxed text-secondary-800">
          <h2 className="font-bold">三、有效期</h2>
          <p>自签署之日起至{LINE}止；委托方可书面通知受托方及云境OS提前终止。</p>
          <h2 className="mt-4 font-bold text-secondary-600">3. Validity</h2>
          <p className="text-secondary-500">From the date of signature until the date above; the Principal may terminate early by written notice to the Agent and Yunjing OS.</p>
        </div>

        <div className="mt-6 space-y-2 text-sm leading-relaxed text-secondary-800">
          <h2 className="font-bold">四、其他</h2>
          <p>1. 本文件供云境OS进行主体与授权形式核验，平台仅作形式审查，不构成对代理权限的实质担保；</p>
          <p>2. 本文件一式两份，委托方与受托方各执一份，扫描件上传云境OS留存。</p>
          <h2 className="mt-4 font-bold text-secondary-600">4. Miscellaneous</h2>
          <p className="text-secondary-500">This document is provided to Yunjing OS for formal verification of the entity and authorization; such verification is formal only and does not constitute a substantive guarantee of the agency rights. This document is made in duplicate, one for each party; a scanned copy shall be uploaded to Yunjing OS for record.</p>
        </div>

        <div className="mt-8 space-y-6 text-sm text-secondary-800">
          <div>
            <p>委托方（盖章）：____________________ 授权代表签字：____________________</p>
            <p className="text-secondary-500">Principal (Seal): ____________________  Authorized Signature: ____________________</p>
            <p>日期：{fmtDate().slice(0, 4)}年____月____日</p>
            <p className="text-secondary-500">Date: ____________________</p>
          </div>
          <div>
            <p>受托方（盖章 / 确认）：____________________ 授权代表签字：____________________</p>
            <p className="text-secondary-500">Agent (Seal / Confirmation): ____________________  Authorized Signature: ____________________</p>
            <p>日期：{fmtDate().slice(0, 4)}年____月____日</p>
            <p className="text-secondary-500">Date: ____________________</p>
          </div>
        </div>

        <p className="mt-8 text-xs text-secondary-400">
          注：本模板由云境OS提供，仅为格式参考；委托方可根据适用法律与内部制度调整条款。
          <br />
          Note: This template is provided by Yunjing OS for reference only; the Principal may adapt it to applicable law and internal rules.
        </p>
      </div>
    </div>
  );
}
