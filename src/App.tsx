/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
    Globe,
    Building2,
    FileText,
    Users,
    Briefcase,
    BookOpen,
    Crown,
    Search,
    Filter,
    ArrowLeft,
    ArrowRight,
    Plus,
    MessageSquare,
    Sparkles,
    Download,
    CheckCircle2,
    AlertCircle,
    Clock,
    Phone,
    Mail,
    FileDown,
    X,
    ChevronDown,
    LayoutGrid,
    TrendingUp,
    Activity,
    Menu
} from "lucide-react";

import { SUPPLIERS, OPPORTUNITIES } from "@/data";
import { useLocale } from "@/core/i18n";
import type { ExhibitionHall, Supplier, Lead, Opportunity } from "@/types";
import PaymentModal from "./PaymentModal";

// Features modules (Phase 4 migration)
import { ShowroomPage } from "@/features/showroom";
import { ProcurementPage } from "@/features/procurement";
import { SupplierPage } from "@/features/supplier";
import { CrmPage } from "@/features/crm";
import { ServicesPage } from "@/features/services";
import { LearningPage } from "@/features/learning";
import { MembershipPage } from "@/features/membership";
import { TrainingPage as FeatureTrainingPage } from "@/features/training";

type AuthUser = {
    user_key: string;
    email: string;
    display_name?: string;
    membership_tier?: "free" | "vip" | string;
    supplier_id?: number | null;
    supplier_industry_id?: number | null;
    supplier_industry?: string | null;
};

export default function App() {
    // Localization — managed by LocaleContext
    const { t, locale, setLocale } = useLocale();
    
    // React Router hooks
    const navigate = useNavigate();
    const location = useLocation();

    // Membership & Mode state
    const [isVip, setIsVip] = useState<boolean>(false);
    const [userEmail, setUserEmail] = useState<string>("sirming2024@gmail.com");
    const [authUser, setAuthUser] = useState<AuthUser | null>(null);
    const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
    const [authMode, setAuthMode] = useState<"login" | "register">("login");
    const [authError, setAuthError] = useState<string>("");
    const [billingMessage, setBillingMessage] = useState<string>("");
    const [claimMessage, setClaimMessage] = useState<string>("");
    const [authForm, setAuthForm] = useState({
        displayName: "",
        email: "",
        password: ""
    });
    const [claimForm, setClaimForm] = useState({
        companyName: "",
        supplierType: "domestic",
        contactName: "",
        contactPhone: "",
        businessLicenseNo: ""
    });

    // Main UI Navigation Tab
    // 1: Showrooms, 2: Joint Procure, 3: Suppliers, 4: CRM Panel, 5: Ecosystem, 6: Learning, 7: Membership
    // Payment modal state
    const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
    const [paymentPlan, setPaymentPlan] = useState<{ code: string; name: string; price: number; currency: string } | null>(null);

    // Derive route state from URL pathname
    const isTrainingRoute = location.pathname === "/training";
    const activeTab = (() => {
        if (isTrainingRoute) return 0;
        const path = location.pathname;
        if (path === "/showroom" || path === "/") return 1;
        if (path === "/procurement") return 2;
        if (path === "/supplier") return 3;
        if (path === "/crm") return 4;
        if (path === "/services") return 5;
        if (path === "/learning") return 6;
        if (path === "/membership") return 7;
        return 1; // default
    })();

    // Server-state data synchronization
    const [leads, setLeads] = useState<Lead[]>([]);
    const [customSuppliers, setCustomSuppliers] = useState<Supplier[]>([]);
    const [isLoadingLeads, setIsLoadingLeads] = useState<boolean>(false);

    // Forms modals visibility
    const [showShowroomForm, setShowShowroomForm] = useState<boolean>(false);
    const [showSupplierForm, setShowSupplierForm] = useState<boolean>(false);
    const [showConsultForm, setShowConsultForm] = useState<boolean>(false);

    // Selected items inside modals for quick view or registration
    const [selectedShowroom, setSelectedShowroom] = useState<ExhibitionHall | null>(null);
    const [showroomFormSubmitted, setShowroomFormSubmitted] = useState<boolean>(false);
    const [supplierFormSubmitted, setSupplierFormSubmitted] = useState<boolean>(false);
    const [consultFormSubmitted, setConsultFormSubmitted] = useState<boolean>(false)  ;

    // AI Matchmake Workspace State
    const [matchSelectedSupplier, setMatchSelectedSupplier] = useState<Supplier | null>(null);
    const [matchSelectedOpportunity, setMatchSelectedOpportunity] = useState<Opportunity | null>(null);
    const [isAiMatching, setIsAiMatching] = useState<boolean>(false);
    const [aiReport, setAiReport] = useState<string>("");
    const [subscribingOppMessage, setSubscribingOppMessage] = useState<string | null>(null);

    // Drag and drop simulator state
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

    // Mobile navigation & sidebar drawers controls
    const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
    const [mobileFilterDrawerOpen, setMobileFilterDrawerOpen] = useState<boolean>(false);

    // Showrooms register local form inputs
    const [showroomFormInputs, setShowroomFormInputs] = useState({
        companyName: "",
        country: "China",
        city: "",
        contactPerson: "",
        contactMethod: "",
        email: "",
        industry: "机械 (Machinery)",
        mainProducts: "",
        has国际公共采购: false,
        notes: ""
    });

    // Supplier register local form inputs
    const [supplierFormInputs, setSupplierFormInputs] = useState({
        nameZh: "",
        nameEn: "",
        type: "domestic",
        industryZh: "机械",
        industryEn: "Machinery",
        countryZh: "中国",
        countryEn: "China",
        cityZh: "",
        cityEn: "",
        ungmCode: "",
        mainProductsZh: "",
        mainProductsEn: "",
        complianceLabelsZh: "ISO9001, CE认证",
        complianceLabelsEn: "ISO9001, CE Certified",
        contactPerson: "",
        contactEmail: "",
        contactPhone: ""
    });

    // Fetch initial leads & custom suppliers from server
    const fetchData = async () => {
        setIsLoadingLeads(true);
        try {
            const leadsRes = await fetch("/api/leads");
            if (leadsRes.ok) {
                const data = await leadsRes.json();
                setLeads(data);
            }
            const supsRes = await fetch("/api/suppliers/custom");
            if (supsRes.ok) {
                const data = await supsRes.json();
                setCustomSuppliers(data);
            }
        } catch (e) {
            console.error("Error reading database api endpoints:", e);
        } finally {
            setIsLoadingLeads(false);
        }
    };

  const persistAuthUser = (user: AuthUser) => {
    setAuthUser(user);
    setUserEmail(user.email);
    setIsVip(user.membership_tier === "vip");
    window.localStorage.setItem("supply_os_auth_user", JSON.stringify(user));
  };

  const refreshAuthUser = async (userKey: string) => {
    try {
      const res = await fetch(`/api/auth/user?user_key=${encodeURIComponent(userKey)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.user) throw new Error(data.error || "刷新账号状态失败");
      persistAuthUser(data.user);
      return data.user as AuthUser;
    } catch (err) {
      console.error("Error refreshing auth user:", err);
      return null;
    }
  };

  useEffect(() => {
    const savedUser = window.localStorage.getItem("supply_os_auth_user");
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser) as AuthUser;
        persistAuthUser(parsedUser);
        refreshAuthUser(parsedUser.user_key);
      } catch {
        window.localStorage.removeItem("supply_os_auth_user");
      }
    }
    fetchData();
    // Default selecting elements for AI matchmaking
    if (SUPPLIERS.length > 0) {
      setMatchSelectedSupplier(SUPPLIERS[0]);
    }
    if (OPPORTUNITIES.length > 0) {
      setMatchSelectedOpportunity(OPPORTUNITIES[0]);
    }
  }, []);

  useEffect(() => {
    if (showAuthModal && authUser?.user_key) {
      refreshAuthUser(authUser.user_key);
    }
  }, [showAuthModal, authUser?.user_key]);

  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    f.querySelectorAll('input, textarea, select').forEach((el: any) => el.setCustomValidity(!el.value || !String(el.value).trim() ? t("formRequired") : ''));
    if (!f.reportValidity()) return;
    setAuthError("");
    setBillingMessage("");
    setClaimMessage("");

    if (!authForm.email || !authForm.password) {
      setAuthError(t("formError"));
      return;
    }

    if (authMode === "register" && !claimForm.companyName.trim()) {
      setAuthError("注册供应商会员时请填写公司名称");
      return;
    }

    try {
      const res = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authForm.email,
          password: authForm.password,
          display_name: authForm.displayName || authForm.email.split("@")[0]
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登录失败，请稍后重试");
      persistAuthUser(data.user);
      setAuthForm({ displayName: "", email: data.user.email, password: "" });

      if (authMode === "register") {
        const claimRes = await fetch("/api/supplier-claims", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_key: data.user.user_key,
            company_name: claimForm.companyName,
            supplier_type: claimForm.supplierType,
            contact_name: claimForm.contactName || authForm.displayName,
            contact_phone: claimForm.contactPhone,
            contact_email: data.user.email,
            business_license_no: claimForm.businessLicenseNo
          })
        });
        const claimData = await claimRes.json().catch(() => ({}));
        if (!claimRes.ok) throw new Error(claimData.error || "账号已注册，但供应商申请提交失败");
        setClaimMessage("注册成功，供应商绑定申请已提交，等待后台审核。");
      }
    } catch (err: any) {
      setAuthError(err.message || "登录失败，请稍后重试");
    }
  };

  const logout = () => {
    setAuthUser(null);
    setIsVip(false);
    window.localStorage.removeItem("supply_os_auth_user");
  };

  // 硬编码套餐 fallback（API 不可用时使用）
  const FALLBACK_PLANS: Record<string, { name: string; price: number; currency: string; zhName: string; enName: string }> = {
    annual_8800: { name: "年度顾问服务 / Annual Advisory Service", price: 8800, currency: "CNY", zhName: "年度顾问服务", enName: "Annual Advisory Service" },
  };

  const buyPlan = (planCode: string) => {
    if (!authUser) {
      setShowAuthModal(true);
      setAuthMode("login");
      setBillingMessage(t("authLoginRequiredToPurchase"));
      return;
    }
    setBillingMessage("");

    // 优先使用 fallback 快速打开支付弹窗（API 异步拉取作为补充）
    const cached = FALLBACK_PLANS[planCode];
    if (cached) {
      const displayName = locale === "zh" ? cached.zhName : cached.enName;
      setPaymentPlan({ code: planCode, name: displayName, price: cached.price, currency: cached.currency });
      setShowPaymentModal(true);
    }

    // 后台异步验证套餐（如果 API 可用就更新价格）
    fetch("/api/membership/plans")
      .then((res) => res.json())
      .then((plans) => {
        const plan = plans.find((p: any) => p.plan_code === planCode);
        if (plan && plan.price > 0) {
          setPaymentPlan({ code: plan.plan_code, name: plan.name, price: Number(plan.price), currency: plan.currency || "CNY" });
        }
      });
  };

    const submitSupplierClaim = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!authUser) {
            setClaimMessage("请先登录后再绑定公司");
            return;
        }
        setClaimMessage("");
        try {
            const res = await fetch("/api/supplier-claims", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_key: authUser.user_key,
                    company_name: claimForm.companyName,
                    supplier_type: claimForm.supplierType,
                    contact_name: claimForm.contactName,
                    contact_phone: claimForm.contactPhone,
                    contact_email: authUser.email,
                    business_license_no: claimForm.businessLicenseNo
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "绑定申请提交失败");
            setClaimMessage(`绑定申请已提交，状态：${data.status}`);
        } catch (err: any) {
            setClaimMessage(err.message || "绑定申请提交失败");
        }
    };

    // Post new Exhibition Hall leads to server
    const handleShowroomSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const f = e.currentTarget as HTMLFormElement;
        f.querySelectorAll('input, textarea, select').forEach((el: any) => el.setCustomValidity(!el.value || !String(el.value).trim() ? t("formRequired") : ''));
        if (!f.reportValidity()) return;
        if (!showroomFormInputs.companyName || !showroomFormInputs.contactPerson || !showroomFormInputs.contactMethod) {
            return;
        }
        try {
            const res = await fetch("/api/leads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    companyName: showroomFormInputs.companyName,
                    country: showroomFormInputs.country === "China" ? "中国" : showroomFormInputs.country,
                    city: showroomFormInputs.city,
                    contactPerson: showroomFormInputs.contactPerson,
                    contactMethod: showroomFormInputs.contactMethod,
                    email: showroomFormInputs.email,
                    industry: showroomFormInputs.industry,
                    mainProducts: showroomFormInputs.mainProducts,
                    has国际公共采购Participation: showroomFormInputs.has国际公共采购,
                    notes: `[申请海外展厅: ${selectedShowroom ? selectedShowroom.nameZh : '通用展厅'}] ${showroomFormInputs.notes}. 模拟附件: ${uploadedFiles.join(", ") || "无"}`,
                    type: "exhibition_register"
                })
            });
            if (res.ok) {
                setShowroomFormSubmitted(true);
                fetchData();
                setTimeout(() => {
                    setShowShowroomForm(false);
                    setShowroomFormSubmitted(false);
                    resetShowroomForm();
                }, 3000);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const resetShowroomForm = () => {
        setShowroomFormInputs({
            companyName: "",
            country: "China",
            city: "",
            contactPerson: "",
            contactMethod: "",
            email: "",
            industry: "机械 (Machinery)",
            mainProducts: "",
            has国际公共采购: false,
            notes: ""
        });
        setUploadedFiles([]);
    };

    // Post Supplier Registration to server
    const handleSupplierSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const f = e.currentTarget as HTMLFormElement;
        f.querySelectorAll('input, textarea, select').forEach((el: any) => el.setCustomValidity(!el.value || !String(el.value).trim() ? t("formRequired") : ''));
        if (!f.reportValidity()) return;
        if (!supplierFormInputs.nameZh || !supplierFormInputs.contactPerson || !supplierFormInputs.contactEmail) {
            return;
        }

        try {
            const res = await fetch("/api/suppliers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...supplierFormInputs,
                    mainProductsZh: supplierFormInputs.mainProductsZh.split(","),
                    mainProductsEn: supplierFormInputs.mainProductsEn ? supplierFormInputs.mainProductsEn.split(",") : [supplierFormInputs.mainProductsZh],
                    complianceLabelsZh: supplierFormInputs.complianceLabelsZh.split(","),
                    complianceLabelsEn: supplierFormInputs.complianceLabelsEn.split(",")
                })
            });

            if (res.ok) {
                setSupplierFormSubmitted(true);
                fetchData();
                setTimeout(() => {
                    setShowSupplierForm(false);
                    setSupplierFormSubmitted(false);
                    resetSupplierForm();
                }, 3000);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const resetSupplierForm = () => {
        setSupplierFormInputs({
            nameZh: "",
            nameEn: "",
            type: "domestic",
            industryZh: "机械",
            industryEn: "Machinery",
            countryZh: "中国",
            countryEn: "China",
            cityZh: "",
            cityEn: "",
            ungmCode: "",
            mainProductsZh: "",
            mainProductsEn: "",
            complianceLabelsZh: "ISO9001, CE认证",
            complianceLabelsEn: "ISO9001, CE Certified",
            contactPerson: "",
            contactEmail: "",
            contactPhone: ""
        });
    };

    // Submit Consult Request Lead
    const handleConsultSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const f = e.currentTarget as HTMLFormElement;
        f.querySelectorAll('input, textarea, select').forEach((el: any) => el.setCustomValidity(!el.value || !String(el.value).trim() ? t("formRequired") : ''));
        if (!f.reportValidity()) return;
        const company = (e.currentTarget as any).companyName.value;
        const person = (e.currentTarget as any).contactPerson.value;
        const phone = (e.currentTarget as any).phone.value;
        const notes = (e.currentTarget as any).notes.value;

        if (!company || !person || !phone) {
            return;
        }

        try {
            const res = await fetch("/api/leads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    companyName: company,
                    contactPerson: person,
                    contactMethod: phone,
                    notes: t("consultRequestPrefix", { notes }),
                    type: "consulting_advisor",
                    industry: "Services"
                })
            });
            if (res.ok) {
                setConsultFormSubmitted(true);
                fetchData();
                setTimeout(() => {
                    setShowConsultForm(false);
                    setConsultFormSubmitted(false);
                }, 2200);
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Trigger Gemini AI custom matching model call
    const triggerAiMatchmaking = async () => {
        if (!matchSelectedSupplier || !matchSelectedOpportunity) {
            alert("Please select a target supplier and opportunity benchmark first!");
            return;
        }
        setIsAiMatching(true);
        setAiReport("");
        try {
            const response = await fetch("/api/ai/matchmake", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    supplier: matchSelectedSupplier,
                    opportunity: matchSelectedOpportunity,
                    language: locale
                })
            });
            if (response.ok) {
                const resJson = await response.json();
                setAiReport(resJson.analysis);
            } else {
                setAiReport(t("aiMatchHttpError"));
            }
        } catch (err) {
            setAiReport(t("aiMatchNetworkError"));
        } finally {
            setIsAiMatching(false);
        }
    };

    // Add Operation CRM interaction follow up log dynamically
    // 注意：此函数已迁移至 CrmPage 组件内部管理，App 层保留简化版本用于向后兼容
    const addCrmFollowUpLog = async (_e: React.FormEvent) => {
        // CrmPage 组件现在完全管理自己的跟进日志逻辑
        // 这个函数保留为空实现，避免编译错误
        console.log("CRM follow-up log is now managed by CrmPage component");
    };

    // Subscribe to Opportunity Simulation
    const handleSubscribeOpportunity = (title: string) => {
        setSubscribingOppMessage(t("subscribeOppSuccess"));
        setTimeout(() => {
            setSubscribingOppMessage(null);
        }, 4000);
    };

    // 真实下载文件并上报下载次数统计
    const handleRealDownload = (fileUrl: string, fileName: string, materialId: string) => {
        const a = document.createElement("a");
        a.href = fileUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // 异步上报下载统计，失败不影响下载
        fetch("/api/training/downloads/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ material_id: materialId, file_name: fileName })
        }).catch(() => { });
    };

    // Drag and drop handlers for simulation
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };
    const handleDragLeave = () => {
        setIsDragging(false);
    };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const filesArr: string[] = [];
            for (let i = 0; i < e.dataTransfer.files.length; i++) {
                filesArr.push(e.dataTransfer.files[i].name);
            }
            setUploadedFiles((prev) => [...prev, ...filesArr]);
        }
    };

    const triggerInputFileClick = () => {
        const names = ["Enterprise_Profile_EN.pdf", "ISO9001_Declaration.png", "Product_Specification_Dossier.docx"];
        const randomName = names[Math.floor(Math.random() * names.length)];
        setUploadedFiles((prev) => [...prev, randomName]);
    };

    const switchMainTab = (tabId: number) => {
        const routes: Record<number, string> = {
            1: "/showroom",
            2: "/procurement",
            3: "/supplier",
            4: "/crm",
            5: "/services",
            6: "/learning",
            7: "/membership"
        };
        const route = routes[tabId] || "/showroom";
        navigate(route);
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-teal-500 selection:text-white transition-colors duration-200">

            {/* 1. TOP GLOBAL HEADER */}
            <header className="sticky top-0 z-40 bg-white border-b border-slate-200/80 shadow-xs backdrop-blur-md bg-white/95">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex justify-between items-center">

                    {/* Logo & Platform Name */}
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-indigo-600 flex items-center justify-center text-white font-extrabold shadow-sm">
                            <Globe className="w-6 h-6 animate-spin-slow" />
                        </div>
                        <div>
                            <h1 className="text-lg md:text-xl font-bold tracking-tight bg-gradient-to-r from-teal-700 to-slate-900 bg-clip-text text-transparent">
                                {t("brandName")}
                            </h1>
                            <div className="text-xs text-slate-400 font-mono hidden md:block">
                                SYS: ACTIVE | UTC: 2026-05-30
                            </div>
                        </div>
                    </div>

                    {/* Right controls: Language, Mode, VIP toggle */}
                    <div className="flex items-center space-x-3">

                        {/* VIP Display Pill */}
                        <button
                            onClick={() => {
                                setShowAuthModal(true);
                                setAuthMode(authUser ? "login" : "login");
                            }}
                            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all duration-300 ${isVip
                                ? "bg-amber-100 text-amber-800 border border-amber-300 shadow-sm"
                                : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
                                }`}
                            title={authUser ? authUser.email : "登录 / 注册会员"}
                        >
                            <Crown className="w-3.5 h-3.5" />
                            <span>{authUser ? `${authUser.display_name || authUser.email} · ${isVip ? "VIP" : "FREE"}` : "GUEST LEVEL"}</span>
                        </button>

                        {/* Language Switch Button */}
                        <button
                            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
                            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-55 bg-slate-50 text-xs font-medium cursor-pointer"
                        >
                            <Globe className="w-3.5 h-3.5 text-teal-600" />
                            <span>{locale === "zh" ? "English" : "中文"}</span>
                        </button>

                        {/* Mobile menu trigger */}
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            </header>

            {/* MOBILE EXPANDABLE MENU */}
            {mobileMenuOpen && (
                <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-2 text-sm z-30 shadow-md">
                    <div className="grid grid-cols-2 gap-2 text-center">
                        <button
                            onClick={() => { switchMainTab(1); setMobileMenuOpen(false); }}
                            className={`p-2 rounded-lg ${!isTrainingRoute && activeTab === 1 ? "bg-teal-50 text-teal-700 font-semibold" : "bg-slate-50"}`}
                        >
                            {t("navShowrooms")}
                        </button>
                        <button
                            onClick={() => { switchMainTab(2); setMobileMenuOpen(false); }}
                            className={`p-2 rounded-lg ${!isTrainingRoute && activeTab === 2 ? "bg-teal-50 text-teal-700 font-semibold" : "bg-slate-50"}`}
                        >
                            {t("navJointProcure")}
                        </button>
                        <button
                            onClick={() => { switchMainTab(3); setMobileMenuOpen(false); }}
                            className={`p-2 rounded-lg ${!isTrainingRoute && activeTab === 3 ? "bg-teal-50 text-teal-700 font-semibold" : "bg-slate-50"}`}
                        >
                            {t("navSuppliers")}
                        </button>
                        <button
                            onClick={() => { switchMainTab(4); setMobileMenuOpen(false); }}
                            className={`p-2 rounded-lg ${!isTrainingRoute && activeTab === 4 ? "bg-teal-50 text-teal-700 font-semibold" : "bg-slate-50"}`}
                        >
                            {t("navCRM")}
                        </button>
                        <button
                            onClick={() => { switchMainTab(5); setMobileMenuOpen(false); }}
                            className={`p-2 rounded-lg ${!isTrainingRoute && activeTab === 5 ? "bg-teal-50 text-teal-700 font-semibold" : "bg-slate-50"}`}
                        >
                            {t("navServices")}
                        </button>
                        <button
                            onClick={() => { switchMainTab(6); setMobileMenuOpen(false); }}
                            className={`p-2 rounded-lg ${!isTrainingRoute && activeTab === 6 ? "bg-teal-50 text-teal-700 font-semibold" : "bg-slate-50"}`}
                        >
                            {t("navLearning")}
                        </button>
                    </div>
                    <div className="border-t border-slate-100 pt-3">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>{t("guestMode")}: <strong>{userEmail}</strong></span>
                            <button
                                onClick={() => setShowAuthModal(true)}
                                className="text-teal-600 font-bold hover:underline"
                            >
                                {authUser ? (isVip ? "✓ VIP ON" : "👉 UPGRADE VIP") : "登录 / 注册"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. PRIMARY DESKTOP NAVIGATION TABS */}
            <nav className="hidden md:block bg-slate-900 text-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex space-x-1.5 py-2 overflow-x-auto whitespace-nowrap scrollbar-none">

                        {[
                            { id: 1, label: t("navShowrooms"), icon: Building2 },
                            { id: 2, label: t("navJointProcure"), icon: Globe },
                            { id: 3, label: t("navSuppliers"), icon: Users },
                            { id: 4, label: `${t("navCRM")}`, icon: Briefcase, alert: true },
                            { id: 5, label: t("navServices"), icon: LayoutGrid },
                            { id: 6, label: t("navLearning"), icon: BookOpen },
                            { id: 7, label: t("navMembership"), icon: Crown, highlight: true }
                        ].map((tab) => {
                            const IconComp = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => switchMainTab(tab.id)}
                                    className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${!isTrainingRoute && activeTab === tab.id
                                        ? "bg-teal-600 text-white shadow-md font-semibold"
                                        : tab.highlight
                                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/25 hover:bg-amber-500/20"
                                            : "hover:bg-slate-800 text-slate-300"
                                        }`}
                                >
                                    <IconComp className={`w-4 h-4 ${tab.highlight && (!isTrainingRoute && activeTab !== tab.id) ? "text-amber-400 animate-pulse" : ""}`} />
                                    <span>{tab.label}</span>
                                    {tab.alert && (
                                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </nav>

            {/* 3. MAIN WORKSPACE WRAPPER */}
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">

                {/* Dynamic header summary banner depending on Active Tab */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-teal-55/20 via-white to-slate-50">
                    <div>
                        <span className="text-xs font-bold text-teal-600 uppercase tracking-widest px-2.5 py-1 rounded-full bg-teal-100/60 inline-block mb-2">
                            SESSION ACTIVE STATUS
                        </span>
                        <h2 className="text-xl md:text-2xl font-extrabold text-slate-800">
                            {isTrainingRoute && t("trainingRegisterTitle")}
                            {!isTrainingRoute && activeTab === 1 && t("showroomTitle")}
                            {!isTrainingRoute && activeTab === 2 && t("procurementNoticePoolTitle")}
                            {!isTrainingRoute && activeTab === 3 && t("supplierMgmtTitle")}
                            {!isTrainingRoute && activeTab === 4 && t("crmDashboard")}
                            {!isTrainingRoute && activeTab === 5 && t("serviceEcoTitle")}
                            {!isTrainingRoute && activeTab === 6 && t("learningTitle")}
                            {!isTrainingRoute && activeTab === 7 && t("membershipTitle")}
                        </h2>
                        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
                            {isTrainingRoute && "独立报名页面，可用于海报、二维码和外部跳转访问。"}
                            {!isTrainingRoute && activeTab === 1 && t("showroomSubTitle")}
                            {!isTrainingRoute && activeTab === 3 && t("tabSupplierDesc")}
                            {!isTrainingRoute && activeTab === 4 && t("tabCrmDesc")}
                            {!isTrainingRoute && activeTab === 5 && t("ecosystemsSummary")}
                            {!isTrainingRoute && activeTab === 6 && t("tabLearningDesc")}
                            {!isTrainingRoute && activeTab === 7 && t("tabMembershipDesc")}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2.5 shrink-0">
                        {isTrainingRoute && (
                            <button
                                onClick={() => {
                                    navigate("/procurement");
                                }}
                                className="inline-flex items-center space-x-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold shadow-xs cursor-pointer"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                <span>{t("backToProcurement")}</span>
                            </button>
                        )}
                        {!isTrainingRoute && activeTab === 1 && (
                            <button
                                onClick={() => {
                                    setSelectedShowroom(null);
                                    setShowShowroomForm(true);
                                }}
                                className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-550 text-white rounded-xl text-sm font-semibold shadow-sm hover:translate-y-[-1px] transition-transform cursor-pointer"
                            >
                                <Plus className="w-4 h-4" />
                                <span>{t("registerShowroomBtn")}</span>
                            </button>
                        )}
                        {!isTrainingRoute && activeTab === 3 && (
                            <button
                                onClick={() => setShowSupplierForm(true)}
                                className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-550 text-white rounded-xl text-sm font-semibold shadow-sm hover:translate-y-[-1px] transition-transform cursor-pointer"
                            >
                                <Plus className="w-4 h-4" />
                                <span>{t("registerSupplierBtn")}</span>
                            </button>
                        )}
                        {!isTrainingRoute && activeTab === 2 && (
                            <button
                                onClick={() => {
                                    window.location.hash = "training";
                                }}
                                className="inline-flex items-center space-x-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold shadow-xs cursor-pointer"
                            >
                                <BookOpen className="w-4 h-4 text-orange-100" />
                                <span>{t("procurementScreeningBtn")}</span>
                            </button>
                        )}
                        <button
                            onClick={() => setShowConsultForm(true)}
                            className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold shadow-xs cursor-pointer"
                        >
                            <MessageSquare className="w-4 h-4 text-teal-400" />
                            <span>{t("bookServiceNow")}</span>
                        </button>
                    </div>
                </div>

                {/* Global Warning notifications if VIP status is toggled */}
                {subscribingOppMessage && (
                    <div className="mb-6 p-4 rounded-xl bg-teal-50 border border-teal-300 text-teal-900 flex items-center space-x-3 text-sm animate-bounce">
                        <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
                        <span>{subscribingOppMessage}</span>
                    </div>
                )}

                {isTrainingRoute && <FeatureTrainingPage />}

                {/* ======================================= */}
                {/* TAB 1: OVERSEAS SHOWROOMS (海外展厅) */}
                {/* ======================================= */}
                {!isTrainingRoute && activeTab === 1 && (
                    <ShowroomPage
                        onRegister={(showroom) => {
                            setSelectedShowroom(showroom);
                            setShowShowroomForm(true);
                        }}
                        onConsult={(showroom) => {
                            setSelectedShowroom(showroom);
                            setShowShowroomForm(true);
                        }}
                    />
                )}

                {/* ======================================= */}
                {/* TAB 2: JOINT PROCUREMENT & 国际公共采购 */}
                {/* ======================================= */}
                {!isTrainingRoute && activeTab === 2 && (
                    <ProcurementPage
                        userKey={authUser?.user_key}
                        isVip={isVip}
                        onRequireLogin={() => {
                            setShowAuthModal(true);
                            setAuthMode("login");
                        }}
                    />
                )}

                {/* ======================================= */}
                {/* TAB 3: SUPPLIERS DIRECTORY (供应商管理) */}
                {/* ======================================= */}
                {!isTrainingRoute && activeTab === 3 && (
                    <SupplierPage
                        onAiMatch={(sup) => {
                            setMatchSelectedSupplier(sup);
                            navigate("/crm");
                        }}
                        onContact={(sup) => {
                            alert(`联络人: ${sup.contactPerson}\n邮箱: ${sup.contactEmail}\n电话: ${sup.contactPhone}`);
                        }}
                    />
                )}

                {/* ======================================= */}
                {/* TAB 4: CRM CLIENTS WORKSPACE (客户管理 & 与 CRM 联动) */}
                {/* ======================================= */}
                {!isTrainingRoute && activeTab === 4 && (
                    <CrmPage
                        leads={leads}
                        isLoadingLeads={isLoadingLeads}
                        totalSuppliersList={[...customSuppliers, ...SUPPLIERS]}
                        matchSelectedSupplier={matchSelectedSupplier}
                        matchSelectedOpportunity={matchSelectedOpportunity}
                        isAiMatching={isAiMatching}
                        aiReport={aiReport}
                        onSetMatchSelectedSupplier={setMatchSelectedSupplier}
                        onSetMatchSelectedOpportunity={setMatchSelectedOpportunity}
                        onTriggerAiMatchmaking={triggerAiMatchmaking}
                        onSubscribeOpportunity={handleSubscribeOpportunity}
                        onAddCrmFollowUpLog={addCrmFollowUpLog}
                    />
                )}

                {/* ======================================= */}
                {/* TAB 5: SERVICES ECO SYSTEM (服务生态) */}
                {/* ======================================= */}
                {!isTrainingRoute && activeTab === 5 && (
                    <ServicesPage onBookService={() => setShowConsultForm(true)} />
                )}

                {/* ======================================= */}
                {/* TAB 6: TRAINING REGISTRATION */}
                {/* ======================================= */}
                {!isTrainingRoute && activeTab === 6 && (
                    <LearningPage
                        isVip={isVip}
                        onDownload={handleRealDownload}
                        onUpgradeClick={() => setShowAuthModal(true)}
                    />
                )}

                {/* ======================================= */}
                {/* TAB 7: MEMBERSHIP ZONE (会员专区) */}
                {/* ======================================= */}
                {!isTrainingRoute && activeTab === 7 && (
                    <MembershipPage
                        userEmail={userEmail}
                        isVip={isVip}
                        onUpgradeClick={() => setShowAuthModal(true)}
                        onSendEmail={(email) => alert(t("membershipSendEmailAlert", { email }))}
                    />
                )}

            </main>

            {/* 4. MODALS & FORMS OVERLAYS */}

            {showAuthModal && (
                <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex justify-center items-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200">
                        <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-start">
                            <div>
                                <div className="inline-flex items-center gap-1.5 text-[10px] font-black text-teal-300 bg-teal-400/10 border border-teal-400/20 rounded-full px-2 py-1 mb-2">
                                    <Crown className="w-3.5 h-3.5" />
                                    SUPPLY OS ACCOUNT
                                </div>
                                <h3 className="text-lg font-extrabold">会员登录与供应商注册</h3>
                                <p className="text-xs text-slate-400 mt-1">注册时同步提交公司申请，审核通过后再关联正式供应商身份。</p>
                            </div>
                            <button onClick={() => setShowAuthModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto max-h-[calc(90vh-88px)]">
                            {authUser ? (
                                <div className="space-y-4">
                                    <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-black text-slate-500 uppercase">当前账号</p>
                                                <h4 className="text-lg font-extrabold text-slate-900 mt-1">{authUser.display_name || authUser.email}</h4>
                                                <p className="text-xs text-slate-500 mt-0.5">{authUser.email}</p>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-xs font-black ${isVip ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-white text-slate-600 border border-slate-200"}`}>
                                                {isVip ? "VIP MEMBER" : "FREE MEMBER"}
                                            </span>
                                        </div>
                                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                            <div className="bg-white border border-slate-200 rounded-lg p-3">
                                                <p className="font-black text-slate-400">供应商身份</p>
                                                <p className="font-bold text-slate-800 mt-1">{authUser.supplier_id ? `已审核关联 #${authUser.supplier_id}` : "待提交或待审核"}</p>
                                            </div>
                                            <div className="bg-white border border-slate-200 rounded-lg p-3">
                                                <p className="font-black text-slate-400">线索权益</p>
                                                <p className="font-bold text-slate-800 mt-1">{isVip ? "会员额度可用" : "免费体验额度"}</p>
                                            </div>
                                        </div>
                                    </div>
                                    {claimMessage && <p className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-lg p-3">{claimMessage}</p>}
                                    <button
                                        onClick={logout}
                                        className="w-full py-2.5 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
                                    >
                                        退出登录
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={submitAuth} className="space-y-4">
                                    <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                                        <button
                                            type="button"
                                            onClick={() => setAuthMode("login")}
                                            className={`py-2.5 rounded-lg text-sm font-black ${authMode === "login" ? "bg-white shadow-xs text-slate-900" : "text-slate-500"}`}
                                        >
                                            登录
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAuthMode("register")}
                                            className={`py-2.5 rounded-lg text-sm font-black ${authMode === "register" ? "bg-white shadow-xs text-slate-900" : "text-slate-500"}`}
                                        >
                                            注册供应商
                                        </button>
                                    </div>

                                    {authMode === "register" && (
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-sm font-extrabold text-slate-900">公司申请信息</h4>
                                                <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-1">待审核</span>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <input
                                                    type="text"
                                                    value={authForm.displayName}
                                                    onChange={(e) => setAuthForm({ ...authForm, displayName: e.target.value })}
                                                    placeholder={t("authContactNamePlaceholder")}
                                                    className="px-3 py-2.5 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                />
                                                <select
                                                    value={claimForm.supplierType}
                                                    onChange={(e) => setClaimForm({ ...claimForm, supplierType: e.target.value })}
                                                    className="px-3 py-2.5 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                >
                                                    <option value="domestic">国内供应商</option>
                                                    <option value="international">国外供应商</option>
                                                </select>
                                                <input
                                                    type="text"
                                                    value={claimForm.companyName}
                                                    onChange={(e) => setClaimForm({ ...claimForm, companyName: e.target.value })}
                                                    placeholder={t("authCompanyPlaceholder")}
                                                    className="sm:col-span-2 px-3 py-2.5 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                />
                                                <input
                                                    type="text"
                                                    value={claimForm.contactPhone}
                                                    onChange={(e) => setClaimForm({ ...claimForm, contactPhone: e.target.value })}
                                                    placeholder={t("authPhonePlaceholder")}
                                                    className="px-3 py-2.5 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                />
                                                <input
                                                    type="text"
                                                    value={claimForm.businessLicenseNo}
                                                    onChange={(e) => setClaimForm({ ...claimForm, businessLicenseNo: e.target.value })}
                                                    placeholder={t("authLicensePlaceholder")}
                                                    className="px-3 py-2.5 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        <input
                                            type="email"
                                            value={authForm.email}
                                            onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                                            placeholder={t("authEmailPlaceholder")}
                                            className="w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                        />
                                        <input
                                            type="password"
                                            value={authForm.password}
                                            onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                                            placeholder={t("authPasswordPlaceholder")}
                                            className="w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                            minLength={6}
                                        />
                                    </div>

                                    {authError && <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">{authError}</p>}
                                    {claimMessage && <p className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-lg p-3">{claimMessage}</p>}
                                    <button
                                        type="submit"
                                        className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-black hover:bg-slate-800"
                                    >
                                        {authMode === "login" ? "登录会员" : "注册并提交供应商申请"}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* OVERLAY A: Overseas Exhibition Hall Register Form */}
            {showShowroomForm && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-center items-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200">

                        <div className="bg-slate-900 text-white p-4 flex justify-between items-center bg-gradient-to-r from-slate-950 to-slate-850">
                            <div>
                                <h3 className="text-base font-extrabold">
                                    {selectedShowroom ? t("showroomApplyTitle", { name: locale === "zh" ? selectedShowroom.nameZh : selectedShowroom.nameEn }) : t("showroomApplyDefault")}
                                </h3>
                                <p className="text-[10px] text-slate-400">{t("showroomFormSubtitle")}</p>
                            </div>
                            <button
                                onClick={() => {
                                    setShowShowroomForm(false);
                                    resetShowroomForm();
                                }}
                                className="text-slate-400 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {showroomFormSubmitted ? (
                            <div className="p-8 text-center space-y-4">
                                <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center mx-auto text-teal-650">
                                    <CheckCircle2 className="w-8 h-8 text-teal-600" />
                                </div>
                                <h4 className="text-base font-bold text-slate-800">{t("formSuccess")}</h4>
                                <p className="text-xs text-slate-500">
                                    {t("showroomFormDemoNote")}
                                </p>
                            </div>
                        ) : (
                            <form onSubmit={handleShowroomSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 mb-1">{t("companyName")} *</label>
                                        <input
                                            type="text"
                                            placeholder={t("showroomCompanyPlaceholder")}
                                            value={showroomFormInputs.companyName}
                                            onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, companyName: e.target.value }))}
                                            className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 mb-1">{t("contactPerson")} *</label>
                                        <input
                                            type="text"
                                            placeholder={t("showroomContactPlaceholder")}
                                            value={showroomFormInputs.contactPerson}
                                            onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, contactPerson: e.target.value }))}
                                            className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 mb-1">{t("formContactMethod")}</label>
                                        <input
                                            type="text"
                                            placeholder={t("showroomPhonePlaceholder")}
                                            value={showroomFormInputs.contactMethod}
                                            onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, contactMethod: e.target.value }))}
                                            className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 mb-1">{t("contactEmail")}</label>
                                        <input
                                            type="email"
                                            placeholder="e.g., manager@corp.com"
                                            value={showroomFormInputs.email}
                                            onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, email: e.target.value }))}
                                            className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 mb-1">{t("location")} *</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <select
                                                value={showroomFormInputs.country}
                                                onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, country: e.target.value }))}
                                                className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs"
                                            >
                                                <option value="China">中国 (China)</option>
                                                <option value="Germany">德国 (Germany)</option>
                                                <option value="UAE">阿联酋 (UAE)</option>
                                                <option value="Kenya">肯尼亚 (Kenya)</option>
                                            </select>
                                            <input
                                                type="text"
                                                placeholder={t("showroomCityPlaceholder")}
                                                value={showroomFormInputs.city}
                                                onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, city: e.target.value }))}
                                                className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 mb-1">主营行业 *</label>
                                        <select
                                            value={showroomFormInputs.industry}
                                            onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, industry: e.target.value }))}
                                            className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200"
                                        >
                                            <option value="机械 (Machinery)">机械 (Machinery)</option>
                                            <option value="医疗 (Medical)">医疗 (Medical)</option>
                                            <option value="电子 (Electronics)">电子 (Electronics)</option>
                                            <option value="建材 (Construction)">建材 (Construction)</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 mb-1">{t("formMainProductsGroup")}</label>
                                    <input
                                        type="text"
                                        value={showroomFormInputs.mainProducts}
                                        onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, mainProducts: e.target.value }))}
                                        placeholder={t("mainProductsPlaceholder")}
                                        className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                    />
                                </div>

                                <div className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded border border-slate-150">
                                    <input
                                        type="checkbox"
                                        id="has国际公共采购C"
                                        checked={showroomFormInputs.has国际公共采购}
                                        onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, has国际公共采购: e.target.checked }))}
                                        className="w-4 h-4 text-teal-600 rounded"
                                    />
                                    <label htmlFor="has国际公共采购C" className="text-xs text-slate-700 font-bold select-none cursor-pointer">
                                        {t("showroomUngmCheckbox")}
                                    </label>
                                </div>

                                {/* Simulated file upload area Drag and Drop */}
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 mb-1">{t("qualificationFile")}</label>
                                    <div
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                        onClick={triggerInputFileClick}
                                        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${isDragging ? "border-teal-500 bg-teal-50/50" : "border-slate-300 hover:border-slate-400 bg-slate-50/20"
                                            }`}
                                    >
                                        <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                                        <p className="text-xs text-slate-600 font-semibold">{t("uploadPlaceholder")}</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">{t("uploadFileHint")}</p>

                                        {uploadedFiles.length > 0 && (
                                            <div className="mt-3 space-y-1.5 text-left border-t border-slate-200 pt-2.5 max-h-24 overflow-y-auto">
                                                {uploadedFiles.map((fn, idx) => (
                                                    <div key={idx} className="flex justify-between items-center bg-white px-2.5 py-1 rounded text-xs border border-slate-200">
                                                        <span className="truncate text-slate-750 font-mono text-[11px]">{fn}</span>
                                                        <span className="text-emerald-650 font-bold text-[10px]">模拟上传成功✓</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-xs font-extrabold text-slate-700 mb-1">{t("formSpecialRequests")}</label>
                                    <textarea
                                        rows={2}
                                        value={showroomFormInputs.notes}
                                        onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, notes: e.target.value }))}
                                        placeholder={t("showroomNotesPlaceholder")}
                                        className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                    />
                                </div>

                                <div className="text-[11px] text-slate-400">
                                    {t("formSubmitAgreement")}
                                </div>

                                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowShowroomForm(false);
                                            resetShowroomForm();
                                        }}
                                        className="px-4 py-2 border border-slate-205 text-slate-550 rounded-lg text-xs hover:bg-slate-50 cursor-pointer"
                                    >
                                        {t("cancel")}
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-teal-650 cursor-pointer"
                                    >
                                        {t("submitRequestBtn")}
                                    </button>
                                </div>

                            </form>
                        )}

                    </div>
                </div>
            )}

            {/* OVERLAY B: Certified Supplier Registration Form */}
            {showSupplierForm && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-center items-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200">

                        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                            <div>
                                <h3 className="text-base font-extrabold">{t("supplierRegTitle")}</h3>
                                <p className="text-[10px] text-slate-400">我们将对企业的出口资质合规、安全体系进行双重初核并在跟进链中追踪状态</p>
                            </div>
                            <button
                                onClick={() => {
                                    setShowSupplierForm(false);
                                    resetSupplierForm();
                                }}
                                className="text-slate-400 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {supplierFormSubmitted ? (
                            <div className="p-8 text-center space-y-4">
                                <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center mx-auto">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                                </div>
                                <h4 className="text-base font-bold text-slate-800">{t("formSuccess")}</h4>
                                <p className="text-xs text-slate-500">
                                    您提交的入驻需求已瞬间分拔并且自动生成一条跟进状态为 <strong>pending</strong> (待初审) 的供应商卡片！
                                </p>
                            </div>
                        ) : (
                            <form onSubmit={handleSupplierSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 mb-1">{t("formCompanyNameZh")}</label>
                                        <input
                                            type="text"
                                            value={supplierFormInputs.nameZh}
                                            onChange={(e) => setSupplierFormInputs(prev => ({ ...prev, nameZh: e.target.value }))}
                                            placeholder={t("supplierNameZhPlaceholder")}
                                            className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 mb-1">{t("formCompanyNameEn")}</label>
                                        <input
                                            type="text"
                                            value={supplierFormInputs.nameEn}
                                            onChange={(e) => setSupplierFormInputs(prev => ({ ...prev, nameEn: e.target.value }))}
                                            placeholder="Changzhou Hengli Precision Tooling Co., Ltd."
                                            className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 mb-1">{t("formSupplierType")}</label>
                                        <select
                                            value={supplierFormInputs.type}
                                            onChange={(e) => setSupplierFormInputs(prev => ({ ...prev, type: e.target.value }))}
                                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs"
                                        >
                                            <option value="domestic">{t("supplierTypeDomestic")}</option>
                                            <option value="international">{t("supplierTypeIntl")}</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 mb-1">国际公共采购 Registration Code (如有/非必填)</label>
                                        <input
                                            type="text"
                                            value={supplierFormInputs.ungmCode}
                                            onChange={(e) => setSupplierFormInputs(prev => ({ ...prev, ungmCode: e.target.value }))}
                                            placeholder={t("supplierUnspscPlaceholder")}
                                            className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-205"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 mb-1">{t("formIndustry")}</label>
                                        <select
                                            value={supplierFormInputs.industryZh}
                                            onChange={(e) => {
                                                const zh = e.target.value;
                                                const en = zh === "机械" ? "Machinery" : zh === "电子" ? "Electronics" : "Construction";
                                                setSupplierFormInputs(prev => ({ ...prev, industryZh: zh, industryEn: en }));
                                            }}
                                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs"
                                        >
                                            <option value="机械">机械</option>
                                            <option value="电子">电子</option>
                                            <option value="建材">建材</option>
                                            <option value="医疗">医疗</option>
                                            <option value="化工">化工</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-extrabold text-slate-700 mb-1">{t("formContactPersonPhone")}</label>
                                        <input
                                            type="text"
                                            value={supplierFormInputs.contactPerson}
                                            onChange={(e) => setSupplierFormInputs(prev => ({ ...prev, contactPerson: e.target.value, contactPhone: e.target.value }))}
                                            placeholder={t("supplierContactPlaceholder")}
                                            className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200"
                                        />
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-extrabold text-slate-700 mb-1">{t("formContactEmail")}</label>
                                        <input
                                            type="email"
                                            value={supplierFormInputs.contactEmail}
                                            onChange={(e) => setSupplierFormInputs(prev => ({ ...prev, contactEmail: e.target.value }))}
                                            placeholder="name@company.com"
                                            className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200"
                                        />
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-extrabold text-slate-700 mb-1">{t("formMainProductsZh")}</label>
                                        <input
                                            type="text"
                                            value={supplierFormInputs.mainProductsZh}
                                            onChange={(e) => setSupplierFormInputs(prev => ({ ...prev, mainProductsZh: e.target.value, mainProductsEn: e.target.value }))}
                                            placeholder={t("supplierProductsPlaceholder")}
                                            className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowSupplierForm(false);
                                            resetSupplierForm();
                                        }}
                                        className="px-4 py-2 border border-slate-200 text-slate-500 rounded-lg text-xs"
                                    >
                                        {t("cancel")}
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
                                    >
                                        {t("supplierRegSubmitBtn")}
                                    </button>
                                </div>

                            </form>
                        )}

                    </div>
                </div>
            )}

            {/* OVERLAY C: General Consultancy Request Dialogue */}
            {showConsultForm && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-center items-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200">

                        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                            <h3 className="text-sm font-extrabold">{t("consultTitle")}</h3>
                            <button onClick={() => setShowConsultForm(false)} className="text-slate-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {consultFormSubmitted ? (
                            <div className="p-8 text-center space-y-3">
                                <CheckCircle2 className="w-10 h-10 text-teal-600 mx-auto" />
                                <h4 className="text-sm font-bold text-slate-800">{t("consultBookedTitle")}</h4>
                                <p className="text-xs text-slate-500">
                                    {t("consultBookedDesc")}
                                </p>
                            </div>
                        ) : (
                            <form onSubmit={handleConsultSubmit} className="p-5 space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">{t("formConsultCompany")}</label>
                                    <input
                                        type="text"
                                        name="companyName"
                                        placeholder={t("consultCompanyPlaceholder")}
                                        className="w-full px-3 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">{t("consultFormContactName")}</label>
                                    <input
                                        type="text"
                                        name="contactPerson"
                                        placeholder={t("consultPersonPlaceholder")}
                                        className="w-full px-3 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">{t("consultFormPhone")}</label>
                                    <input
                                        type="text"
                                        name="phone"
                                        placeholder="+86 138-xxxx-xxxx"
                                        className="w-full px-3 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">{t("formConsultNeeds")}</label>
                                    <textarea
                                        name="notes"
                                        rows={2}
                                        placeholder={t("consultNotesPlaceholder")}
                                        className="w-full px-3 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                    />
                                </div>

                                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setShowConsultForm(false)}
                                        className="px-3 py-1.5 border border-slate-200 text-slate-400 rounded text-xs"
                                    >
                                        {t("cancel")}
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800"
                                    >
                                        {t("consultSubmitBtn")}
                                    </button>
                                </div>
                            </form>
                        )}

                    </div>
                </div>
            )}

            {/* 5. USER PERSISTENT MOBILE FLOATING BUTTON (FAB) & BOTTOM NAVIGATION */}
            <div className="md:hidden fixed bottom-18 right-4 z-50">
                <button
                    onClick={() => setShowConsultForm(true)}
                    className="w-12 h-12 bg-gradient-to-tr from-teal-600 to-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform"
                    title={t("consultFAB")}
                >
                    <MessageSquare className="w-5 h-5 text-white" />
                </button>
            </div>

            {/* MOBILE BOTTOM NAVIGATION BAR */}
            <footer className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200/80 shadow-lg py-1 flex justify-around items-center">
                {[
                    { id: 1, label: "展厅", icon: Building2 },
                    { id: 2, label: "公采", icon: Globe },
                    { id: 3, label: "供应商", icon: Users },
                    { id: 4, label: "CRM", icon: Briefcase },
                    { id: 6, label: "学习", icon: BookOpen }
                ].map((tab) => {
                    const IconComp = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => switchMainTab(tab.id)}
                            className={`flex flex-col items-center justify-center w-14 py-1 text-[10px] font-semibold transition-colors ${activeTab === tab.id ? "text-teal-600 font-bold" : "text-slate-400"
                                }`}
                        >
                            <IconComp className="w-5 h-5 mb-0.5" />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </footer>

            {/* DESKTOP FOOTER */}
            <footer className="hidden md:block bg-slate-100 border-t border-slate-200 py-6 text-xs text-slate-400">
                <div className="max-w-7xl mx-auto px-4 flex justify-between items-center">
                    <p>{t("footerCopyright")}</p>
                    <div className="flex space-x-4">
                        <span className="hover:underline cursor-pointer">{t("footerTerms")}</span>
                        <span className="hover:underline cursor-pointer">{t("footerPrivacy")}</span>
                        <span className="hover:underline cursor-pointer">{t("footerUnspsc")}</span>
                    </div>
                </div>
            </footer>

            {/* Payment Modal */}
            {showPaymentModal && paymentPlan && authUser && (
                <PaymentModal
                    planCode={paymentPlan.code}
                    planName={paymentPlan.name}
                    amount={paymentPlan.price}
                    currency={paymentPlan.currency}
                    userKey={authUser.user_key}
                    onClose={() => setShowPaymentModal(false)}
                    onPaymentSuccess={(_orderNo) => {
                        setShowPaymentModal(false);
                        setPaymentPlan(null);
                        setIsVip(true);
                        persistAuthUser({ ...authUser, membership_tier: "vip" });
                    }}
                />
            )}

        </div>
    );
}
