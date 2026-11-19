"use client";
/**
 * 供应商联系方式卡片（详情页正文只读段）
 *
 * @module features/supplier-profile/components/SupplierContactCard
 * @description 服务端下发的联系方式恒为脱敏串；VIP 会员在客户端用同一份
 *              `/api/suppliers/[id]/contact` 覆盖为明文（该接口自身有登录 + VIP 双重校验，
 *              非 VIP 会 403）。这样详情页不再需要单独的「查看联系方式」按钮，
 *              明文也不会进入 SSR/ISR 缓存。
 */
import { useEffect, useState } from "react";
import { Mail, Phone, UserRound } from "lucide-react";
import { useOptionalAuth } from "@/core/auth/AuthContext";
import { fetchSupplierContact, type SupplierContact } from "@/shared/api/supplier";

export interface SupplierContactMasked {
  person: string;
  position: string;
  email: string;
  phone: string;
}

export interface SupplierContactCardProps {
  supplierId: string;
  contact: SupplierContactMasked;
  maskedNote: string;
  unlockedNote: string;
}

export function SupplierContactCard({
  supplierId,
  contact,
  maskedNote,
  unlockedNote,
}: SupplierContactCardProps) {
  const auth = useOptionalAuth();
  const authReady = auth?.authReady ?? true;
  const isVip = auth?.isVip ?? false;
  const [full, setFull] = useState<SupplierContact | null>(null);

  useEffect(() => {
    // 非 VIP / 未就绪：保持脱敏串，不发请求（接口也会 403）
    if (!authReady || !isVip) {
      setFull(null);
      return;
    }
    let alive = true;
    fetchSupplierContact(supplierId)
      .then((data) => {
        if (alive) setFull(data);
      })
      .catch(() => {
        // 失败（登录过期 / 会员刚失效）不打断展示，退回脱敏串
        if (alive) setFull(null);
      });
    return () => {
      alive = false;
    };
  }, [supplierId, isVip, authReady]);

  const person = full?.contactPerson || contact.person;
  const phone = full?.contactPhone || contact.phone;
  const email = full?.contactEmail || contact.email;
  const unlocked = full !== null;

  return (
    <>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {person && (
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="font-semibold">{person}</span>
            {contact.position && <span className="text-xs text-slate-400">{contact.position}</span>}
          </div>
        )}
        {phone && (
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Phone className="h-4 w-4 shrink-0 text-slate-400" />
            <span dir="ltr" className="font-semibold text-slate-900">{phone}</span>
          </div>
        )}
        {email && (
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Mail className="h-4 w-4 shrink-0 text-slate-400" />
            <span dir="ltr" className="font-semibold text-slate-900">{email}</span>
          </div>
        )}
      </dl>
      <p className="mt-3 text-2xs text-slate-400">{unlocked ? unlockedNote : maskedNote}</p>
    </>
  );
}