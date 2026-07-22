/**
 * 认证弹窗组件
 * Auth Modal Component
 *
 * @module shared/ui/AuthModal
 * @description 认证弹窗（登录/注册/供应商绑定 Tab 切换）— 全局 UI 组件
 *              Auth modal (login/register/supplier claim tab switch) - global UI component
 */

import { type ReactNode, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Input } from "./Input";

export interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  /** 初始模式 */
  initialMode?: "login" | "register";
  /** 登录回调 */
  onLogin?: (email: string, password: string) => Promise<void>;
  /** 注册回调 */
  onRegister?: (form: {
    email: string;
    password: string;
    displayName: string;
    companyName: string;
    supplierType: string;
  }) => Promise<void>;
}

export function AuthModal({
  open,
  onClose,
  initialMode = "login",
  onLogin,
  onRegister,
}: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [supplierType, setSupplierType] = useState("domestic");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("请填写邮箱和密码");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await onLogin?.(email, password);
        onClose();
      } else {
        if (!companyName.trim()) {
          setError("注册供应商会员时请填写公司名称");
          setLoading(false);
          return;
        }
        await onRegister?.({
          email,
          password,
          displayName: displayName || email.split("@")[0],
          companyName,
          supplierType,
        });
        onClose();
      }
    } catch (err: any) {
      setError(err.message || "操作失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const title = mode === "login" ? "登录" : "注册供应商会员";

  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tab 切换 */}
        <div className="flex gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
              mode === "login"
                ? "border-b-2 border-teal-600 text-teal-600"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
              mode === "register"
                ? "border-b-2 border-teal-600 text-teal-600"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            注册
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            邮箱
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            密码
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        {mode === "register" && (
          <>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                显示名称
              </label>
              <Input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="您的名称"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                公司名称 <span className="text-rose-500">*</span>
              </label>
              <Input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="公司全称"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                供应商类型
              </label>
              <select
                value={supplierType}
                onChange={(e) => setSupplierType(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="domestic">国内供应商</option>
                <option value="overseas">海外供应商</option>
                <option value="un">联合国供应商</option>
              </select>
            </div>
          </>
        )}

        <Button type="submit" loading={loading} className="w-full">
          {mode === "login" ? "登录" : "注册"}
        </Button>
      </form>
    </Modal>
  );
}

AuthModal.displayName = "AuthModal";
