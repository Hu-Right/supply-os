/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
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

import { EXHIBITION_HALLS, SUPPLIERS, OPPORTUNITIES, LEARNING_MATERIALS, FAQS } from "./data";
import { TRANSLATIONS } from "./locales";
import { ExhibitionHall, Supplier, Lead, Opportunity, LearningMaterial, FAQItem } from "./types";

export default function App() {
  // Localization state
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const t = TRANSLATIONS[lang];

  // Membership & Mode state
  const [isVip, setIsVip] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>("sirming2024@gmail.com");

  // Main UI Navigation Tab
  // 1: Showrooms, 2: Joint Procure, 3: Suppliers, 4: CRM Panel, 5: Ecosystem, 6: Learning, 7: Membership
  const [activeTab, setActiveTab] = useState<number>(1);

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedRegion, setSelectedRegion] = useState<string>("");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [selectedIndustry, setSelectedIndustry] = useState<string>("");

  // Suppliers custom filters
  const [supplierSubTab, setSupplierSubTab] = useState<"all" | "domestic" | "international">("all");
  const [supplierIndustry, setSupplierIndustry] = useState<string>("");
  const [supplierUngmCodeSearch, setSupplierUngmCodeSearch] = useState<string>("");

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
  const [consultFormSubmitted, setConsultFormSubmitted] = useState<boolean>(false);

  // AI Matchmake Workspace State
  const [matchSelectedSupplier, setMatchSelectedSupplier] = useState<Supplier | null>(null);
  const [matchSelectedOpportunity, setMatchSelectedOpportunity] = useState<Opportunity | null>(null);
  const [isAiMatching, setIsAiMatching] = useState<boolean>(false);
  const [aiReport, setAiReport] = useState<string>("");

  // CRM Workspace State
  const [activeLeadForLog, setActiveLeadForLog] = useState<Lead | null>(null);
  const [newCrmLogEntry, setNewCrmLogEntry] = useState<string>("");
  const [crmLogStatus, setCrmLogStatus] = useState<string>("");
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
    hasUngm: false,
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

  useEffect(() => {
    fetchData();
    // Default selecting elements for AI matchmaking
    if (SUPPLIERS.length > 0) {
      setMatchSelectedSupplier(SUPPLIERS[0]);
    }
    if (OPPORTUNITIES.length > 0) {
      setMatchSelectedOpportunity(OPPORTUNITIES[0]);
    }
  }, []);

  // Post new Exhibition Hall leads to server
  const handleShowroomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showroomFormInputs.companyName || !showroomFormInputs.contactPerson || !showroomFormInputs.contactMethod) {
      alert("Missing required fields!");
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
          hasUngmParticipation: showroomFormInputs.hasUngm,
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
      hasUngm: false,
      notes: ""
    });
    setUploadedFiles([]);
  };

  // Post Supplier Registration to server
  const handleSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierFormInputs.nameZh || !supplierFormInputs.contactPerson || !supplierFormInputs.contactEmail) {
      alert("Please complete required fields!");
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
    const company = (e.currentTarget as any).companyName.value;
    const person = (e.currentTarget as any).contactPerson.value;
    const phone = (e.currentTarget as any).phone.value;
    const notes = (e.currentTarget as any).notes.value;

    if (!company || !person || !phone) {
      alert("Missing parameters!");
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
          notes: `[咨询顾问申请] ${notes}`,
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
          language: lang
        })
      });
      if (response.ok) {
        const resJson = await response.json();
        setAiReport(resJson.analysis);
      } else {
        setAiReport(lang === "zh" ? "匹配请求失败，请检查网络设置。" : "Matchmaker API error, please retry.");
      }
    } catch (err) {
      setAiReport(lang === "zh" ? "链接API服务出现故障。" : "Connection error to Gemini service.");
    } finally {
      setIsAiMatching(false);
    }
  };

  // Add Operation CRM interaction follow up log dynamically
  const addCrmFollowUpLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLeadForLog || !newCrmLogEntry) return;

    try {
      const res = await fetch("/api/leads/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: activeLeadForLog.id,
          content: newCrmLogEntry,
          author: `运营经理 (${userEmail})`,
          nextStatus: crmLogStatus || activeLeadForLog.status
        })
      });
      if (res.ok) {
        const updatedLead = await res.json();
        // Update local state list automatically
        setLeads((prev) => prev.map((l) => (l.id === updatedLead.id ? updatedLead : l)));
        setActiveLeadForLog(updatedLead);
        setNewCrmLogEntry("");
        alert(t.addLogSuccess);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Subscribe to Opportunity Simulation
  const handleSubscribeOpportunity = (title: string) => {
    setSubscribingOppMessage(t.subscribeOppSuccess);
    setTimeout(() => {
      setSubscribingOppMessage(null);
    }, 4000);
  };

  // Simulation of downloading file from Learning Center
  const handleSimulatedDownload = () => {
    alert(t.hasDownloaded);
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

  // Multi-dimensional filtering logic
  const filteredShowrooms = EXHIBITION_HALLS.filter((eh) => {
    const matchesSearch =
      eh.nameZh.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eh.nameEn.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eh.cityZh.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eh.cityEn.toLowerCase().includes(searchTerm.toLowerCase());

    const regionVal = lang === "zh" ? eh.regionZh : eh.regionEn;
    const countryVal = lang === "zh" ? eh.countryZh : eh.countryEn;

    const matchesRegion = !selectedRegion || regionVal === selectedRegion;
    const matchesCountry = !selectedCountry || countryVal === selectedCountry;

    return matchesSearch && matchesRegion && matchesCountry;
  });

  // Unique list of Regions and Countries for dynamic linking selector UI
  const availableRegions = Array.from(
    new Set(EXHIBITION_HALLS.map((eh) => (lang === "zh" ? eh.regionZh : eh.regionEn)))
  );

  // Available countries depend on the chosen Region
  const availableCountries = Array.from(
    new Set(
      EXHIBITION_HALLS.filter(
        (eh) => !selectedRegion || (lang === "zh" ? eh.regionZh === selectedRegion : eh.regionEn === selectedRegion)
      ).map((eh) => (lang === "zh" ? eh.countryZh : eh.countryEn))
    )
  );

  // Combine default suppliers database with user-created custom suppliers
  const totalSuppliersList = [...customSuppliers, ...SUPPLIERS];

  const filteredSuppliers = totalSuppliersList.filter((sup) => {
    // Basic types
    if (supplierSubTab === "domestic" && sup.type !== "domestic") return false;
    if (supplierSubTab === "international" && sup.type !== "international") return false;

    // Search query
    const matchesSearch =
      sup.nameZh.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sup.nameEn.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sup.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (sup.ungmCode && sup.ungmCode.includes(searchTerm));

    // Sector Filter
    const sectVal = lang === "zh" ? sup.industryZh : sup.industryEn;
    const matchesIndustry = !supplierIndustry || sectVal === supplierIndustry;

    // UNGM Code manual query
    const matchesUngmCode =
      !supplierUngmCodeSearch || (sup.ungmCode && sup.ungmCode.includes(supplierUngmCodeSearch));

    return matchesSearch && matchesIndustry && matchesUngmCode;
  });

  // Unique industries mapping
  const availableSupplierIndustries = Array.from(
    new Set(totalSuppliersList.map((s) => (lang === "zh" ? s.industryZh : s.industryEn)))
  );

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
                {t.brandName}
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
              onClick={() => setIsVip(!isVip)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all duration-300 ${
                isVip
                  ? "bg-amber-100 text-amber-800 border border-amber-300 shadow-sm"
                  : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
              }`}
              title={isVip ? "Gold Premium Member Active" : "Guest Mode - Tap to Upgrade"}
            >
              <Crown className="w-3.5 h-3.5" />
              <span>{isVip ? "GOLD VIP" : "GUEST LEVEL"}</span>
            </button>

            {/* Language Switch Button */}
            <button
              onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-55 bg-slate-50 text-xs font-medium cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-teal-600" />
              <span>{lang === "zh" ? "English" : "中文简体"}</span>
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
              onClick={() => { setActiveTab(1); setMobileMenuOpen(false); }}
              className={`p-2 rounded-lg ${activeTab === 1 ? "bg-teal-50 text-teal-700 font-semibold" : "bg-slate-50"}`}
            >
              {t.navShowrooms}
            </button>
            <button
              onClick={() => { setActiveTab(2); setMobileMenuOpen(false); }}
              className={`p-2 rounded-lg ${activeTab === 2 ? "bg-teal-50 text-teal-700 font-semibold" : "bg-slate-50"}`}
            >
              {t.navJointProcure}
            </button>
            <button
              onClick={() => { setActiveTab(3); setMobileMenuOpen(false); }}
              className={`p-2 rounded-lg ${activeTab === 3 ? "bg-teal-50 text-teal-700 font-semibold" : "bg-slate-50"}`}
            >
              {t.navSuppliers}
            </button>
            <button
              onClick={() => { setActiveTab(4); setMobileMenuOpen(false); }}
              className={`p-2 rounded-lg ${activeTab === 4 ? "bg-teal-50 text-teal-700 font-semibold" : "bg-slate-50"}`}
            >
              {t.navCRM}
            </button>
            <button
              onClick={() => { setActiveTab(5); setMobileMenuOpen(false); }}
              className={`p-2 rounded-lg ${activeTab === 5 ? "bg-teal-50 text-teal-700 font-semibold" : "bg-slate-50"}`}
            >
              {t.navServices}
            </button>
            <button
              onClick={() => { setActiveTab(6); setMobileMenuOpen(false); }}
              className={`p-2 rounded-lg ${activeTab === 6 ? "bg-teal-50 text-teal-700 font-semibold" : "bg-slate-50"}`}
            >
              {t.navLearning}
            </button>
          </div>
          <div className="border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{t.guestMode}: <strong>{userEmail}</strong></span>
              <button
                onClick={() => setIsVip(!isVip)}
                className="text-teal-600 font-bold hover:underline"
              >
                {isVip ? "✓ VIP ON" : "👉 UPGRADE VIP"}
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
              { id: 1, label: t.navShowrooms, icon: Building2 },
              { id: 2, label: t.navJointProcure, icon: Globe },
              { id: 3, label: t.navSuppliers, icon: Users },
              { id: 4, label: `${t.navCRM}`, icon: Briefcase, alert: true },
              { id: 5, label: t.navServices, icon: LayoutGrid },
              { id: 6, label: t.navLearning, icon: BookOpen },
              { id: 7, label: t.navMembership, icon: Crown, highlight: true }
            ].map((tab) => {
              const IconComp = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                    activeTab === tab.id
                      ? "bg-teal-600 text-white shadow-md font-semibold"
                      : tab.highlight
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/25 hover:bg-amber-500/20"
                      : "hover:bg-slate-800 text-slate-300"
                  }`}
                >
                  <IconComp className={`w-4 h-4 ${tab.highlight && activeTab !== tab.id ? "text-amber-400 animate-pulse" : ""}`} />
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
              {activeTab === 1 && t.showroomTitle}
              {activeTab === 2 && t.ungmBriefIntro}
              {activeTab === 3 && t.supplierMgmtTitle}
              {activeTab === 4 && t.crmDashboard}
              {activeTab === 5 && t.serviceEcoTitle}
              {activeTab === 6 && t.learningTitle}
              {activeTab === 7 && t.membershipTitle}
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">
              {activeTab === 1 && t.showroomSubTitle}
              {activeTab === 2 && "结合UNSPSC标准8位编码，提供一站式、透明高效的联合国及其下设机构联合采购匹配、出海案例与流程指引。"}
              {activeTab === 3 && "聚合中方顶尖智造工业制造厂商、以及拥有UNGM合规标签认证的国外跨国配套供应商名册，提供双语筛查。"}
              {activeTab === 4 && "将前端所有海外展厅申请意向、咨询件联络信息全清透录入云端CRM，在线记录并由AI生成跟进转化行动。"}
              {activeTab === 5 && t.ecosystemsSummary}
              {activeTab === 6 && "全面覆盖联合国采购组织合规说明、不可抗力法律投标模板、资质认证测试避坑指南。"}
              {activeTab === 7 && "升级尊享全部金牌共采会员权限，解锁深度招投标文件及多点供采商机报告。"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 shrink-0">
            {activeTab === 1 && (
              <button
                onClick={() => {
                  setSelectedShowroom(null);
                  setShowShowroomForm(true);
                }}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-550 text-white rounded-xl text-sm font-semibold shadow-sm hover:translate-y-[-1px] transition-transform cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t.registerShowroomBtn}</span>
              </button>
            )}
            {activeTab === 3 && (
              <button
                onClick={() => setShowSupplierForm(true)}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-550 text-white rounded-xl text-sm font-semibold shadow-sm hover:translate-y-[-1px] transition-transform cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t.registerSupplierBtn}</span>
              </button>
            )}
            <button
              onClick={() => setShowConsultForm(true)}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold shadow-xs cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 text-teal-400" />
              <span>{t.bookServiceNow}</span>
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

        {/* ======================================= */}
        {/* TAB 1: OVERSEAS SHOWROOMS (海外展厅) */}
        {/* ======================================= */}
        {activeTab === 1 && (
          <div className="space-y-6">
            
            {/* Active Filters */}
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative w-full md:w-1/3">
                <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
                <input
                  type="text"
                  placeholder={t.searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              <div className="flex flex-wrap gap-2.5 w-full md:w-auto items-center justify-end">
                <div className="flex items-center space-x-1 text-xs text-slate-500 mr-2">
                  <Filter className="w-3.5 h-3.5 text-teal-600" />
                  <span>{t.regionFilter}:</span>
                </div>

                <select
                  value={selectedRegion}
                  onChange={(e) => {
                    setSelectedRegion(e.target.value);
                    setSelectedCountry(""); // reset country linkage
                  }}
                  className="px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700"
                >
                  <option value="">{t.allRegions}</option>
                  {availableRegions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700"
                  disabled={!selectedRegion}
                >
                  <option value="">{t.allCountries}</option>
                  {availableCountries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {(selectedRegion || selectedCountry || searchTerm) && (
                  <button
                    onClick={() => {
                      setSelectedRegion("");
                      setSelectedCountry("");
                      setSearchTerm("");
                    }}
                    className="text-xs text-rose-600 font-bold hover:underline"
                  >
                    重置
                  </button>
                )}
              </div>
            </div>

            {/* List of Exhibitions */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredShowrooms.length > 0 ? (
                filteredShowrooms.map((eh) => (
                  <div
                    key={eh.id}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-teal-500/55 shadow-xs overflow-hidden hover:shadow-md transition-all duration-300 flex flex-col group"
                  >
                    {/* Banner Image with Badge */}
                    <div className="relative h-48 w-full overflow-hidden bg-slate-100">
                      <img
                        src={eh.bannerUrl}
                        alt={eh.nameZh}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-550"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
                      <div className="absolute top-4 left-4 bg-teal-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-xs">
                        {lang === "zh" ? eh.regionZh : eh.regionEn} · {lang === "zh" ? eh.countryZh : eh.countryEn}
                      </div>
                      <div className="absolute bottom-4 left-4 right-4 text-white">
                        <p className="text-xl font-bold line-clamp-1">{lang === "zh" ? eh.nameZh : eh.nameEn}</p>
                        <p className="text-xs text-slate-200 mt-0.5 flex items-center">
                          <Clock className="w-3.5 h-3.5 text-teal-400 mr-1" />
                          <span>{t.capacityLabel}: {eh.capacityValue}</span>
                        </p>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <p className="text-sm text-slate-600 line-clamp-3 mb-4 leading-relaxed">
                        {lang === "zh" ? eh.descriptionZh : eh.descriptionEn}
                      </p>

                      <div className="border-t border-slate-100 pt-4 space-y-3">
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.featuredProducts}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {(lang === "zh" ? eh.featuredProductsZh : eh.featuredProductsEn).map((prod, idx) => (
                              <span
                                key={idx}
                                className="bg-slate-100 text-slate-800 text-[11px] px-2.5 py-1 rounded-md border border-slate-200/50"
                              >
                                {prod}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={() => {
                              setSelectedShowroom(eh);
                              setShowShowroomForm(true);
                            }}
                            className="flex-1 py-2 text-center text-xs font-bold text-white bg-slate-900 group-hover:bg-teal-600 rounded-lg shadow-sm transition-colors cursor-pointer"
                          >
                            立即入驻展厅
                          </button>
                          <button
                            onClick={() => {
                              setSelectedShowroom(eh);
                              setShowShowroomForm(true);
                            }}
                            className="px-3 py-2 text-slate-500 hover:text-teal-600 bg-slate-100 hover:bg-teal-50 rounded-lg text-xs font-medium cursor-pointer"
                            title="提交咨询"
                          >
                            咨询顾问
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-12 bg-white rounded-2xl border border-dashed border-slate-200 text-center text-slate-400">
                  <Globe className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                  <p>{t.noData}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================= */}
        {/* TAB 2: JOINT PROCUREMENT & UNGM (共采系列) */}
        {/* ======================================= */}
        {activeTab === 2 && (
          <div className="space-y-6">
            
            {/* UNGM Grid info */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left col: Detailed info guide */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs lg:col-span-8 space-y-6">
                
                <div className="border-b border-indigo-100 pb-3">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center">
                    <Globe className="w-5 h-5 text-indigo-600 mr-2" />
                    <span>{t.qualificationSpecs}</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">联合国采购核心在于将企业资产信誉、技术标准通过UNSPSC主营描述与国际标准精准吻合对接。</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <h4 className="text-sm font-bold text-slate-800 flex items-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-500 mr-2" />
                      基础认证：基本资格 (Basic Access)
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      要求企业在线建立账户、如实核验中/英文营业执照即可申请。适合承接小额度、少规格的试点援助类或者即期零星项目。
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <h4 className="text-sm font-bold text-slate-805 flex items-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 mr-2" />
                      等级一级：单笔不超过 15 万美金
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      需额外提交3个不同独立买方近年的合规商业合作报告与质量合格证书。
                    </p>
                  </div>
                </div>

                {/* 5 steps chart */}
                <div>
                  <h4 className="text-sm font-bold text-slate-800 mb-3">{t.entryProcess}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center text-xs">
                    {[
                      { step: "01", title: "注册UNGM账户", desc: "创建基础公司账户" },
                      { step: "02", title: "关联UNSPSC码", desc: "行业标签分类匹配" },
                      { step: "03", title: "上传资质三证", desc: "合规声明与执照" },
                      { step: "04", title: "对接特定机构", desc: "如WHO、UNHCR" },
                      { step: "05", title: "投标与资质晋级", desc: "提升为1级或2级" }
                    ].map((st, i) => (
                      <div key={i} className="bg-slate-50 rounded-lg p-2.5 border border-slate-200/60 relative">
                        <div className="text-lg font-black text-teal-600/35">{st.step}</div>
                        <div className="font-bold text-slate-700 mt-1 leading-tight">{st.title}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{st.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Win Case Study examples */}
                <div>
                  <h4 className="text-sm font-bold text-slate-800 mb-3">{t.caseMilestones}</h4>
                  <div className="space-y-2">
                    {[
                      {
                        entity: "中国某医疗高科企业 (深圳)",
                        scope: "中标WHO无创呼吸制氧机集采项目",
                        val: "合共金额: $1,280,000 USD",
                        badge: "医疗/健康"
                      },
                      {
                        entity: "山东建筑材料国标龙头工厂",
                        scope: "中标东非某国救灾救援营拆装活动瓦房项目",
                        val: "合共金额: $3,500,000 USD",
                        badge: "建材/装配"
                      }
                    ].map((cs, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-teal-50/40 p-3 rounded-lg border border-teal-100 text-xs">
                        <div>
                          <span className="bg-teal-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold mr-2 uppercase">{cs.badge}</span>
                          <strong className="text-slate-800">{cs.entity}</strong>
                          <span className="text-slate-500 mx-1">-</span>
                          <span className="text-slate-600">{cs.scope}</span>
                        </div>
                        <div className="text-teal-700 font-bold shrink-0">{cs.val}</div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Right col: Supportive services packages & submit reqs */}
              <div className="space-y-6 lg:col-span-4">
                
                {/* Submit Procure Request requirement */}
                <div className="bg-gradient-to-tr from-slate-900 to-slate-800 text-slate-100 rounded-2xl p-5 border border-slate-800 shadow-sm">
                  <div className="flex items-center space-x-2 mb-3">
                    <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
                    <h3 className="text-base font-bold text-white">{t.submitProcureReq}</h3>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed mb-4">
                    如果您是国外主权机构或联合国常驻代办代理商，或者国内贸易商需要协助采购某类大宗保税货源，请在此告知。该需求会瞬间同步至我们后台的备灾供应商链中匹配。
                  </p>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const cname = (form.elements.namedItem("cname") as HTMLInputElement).value;
                      const contact = (form.elements.namedItem("contact") as HTMLInputElement).value;
                      const body = (form.elements.namedItem("reqbody") as HTMLTextAreaElement).value;
                      
                      if (!cname || !contact || !body) {
                        alert("请填写全部输入项！");
                        return;
                      }

                      try {
                        const res = await fetch("/api/leads", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            companyName: cname,
                            contactPerson: "海外采购代表",
                            contactMethod: contact,
                            notes: `[共采平台采购意向提交] 需求详情: ${body}`,
                            type: "requirement_submit"
                          })
                        });
                        if (res.ok) {
                          alert(t.formSuccess);
                          form.reset();
                          fetchData();
                        }
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                    className="space-y-3"
                  >
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">您的机构企业名</label>
                      <input
                        type="text"
                        name="cname"
                        placeholder="E.g., Global RedCross Logistics"
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">联系人与方式 (WhatsApp)</label>
                      <input
                        type="text"
                        name="contact"
                        placeholder="+971-50-xxxxxxx"
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">采购产品规格、数量及运抵港口</label>
                      <textarea
                        name="reqbody"
                        rows={3}
                        placeholder="如需5000套可快装防水活动帐篷，运抵肯尼亚蒙巴萨港口"
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-gradient-to-r from-teal-500 to-teal-600 text-white text-xs font-bold rounded hover:from-teal-600 hover:to-teal-700 cursor-pointer"
                    >
                      提交共采需求
                    </button>
                  </form>
                </div>

                {/* FAQ Collapsible */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <h4 className="text-sm font-bold text-slate-800 mb-3">{t.procureFAQ}</h4>
                  <div className="space-y-2">
                    {FAQS.filter((f) => f.category === "ungm").map((faq) => (
                      <div key={faq.id} className="border-b border-slate-100 pb-2.5 last:border-b-0">
                        <strong className="text-xs text-slate-700 block mb-1">
                          Q: {lang === "zh" ? faq.questionZh : faq.questionEn}
                        </strong>
                        <p className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded leading-relaxed">
                          {lang === "zh" ? faq.answerZh : faq.answerEn}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* ======================================= */}
        {/* TAB 3: SUPPLIERS DIRECTORY (供应商管理) */}
        {/* ======================================= */}
        {activeTab === 3 && (
          <div className="space-y-6">
            
            {/* Inline Toggle Filter tabs for Suppliers */}
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between">
              
              <div className="flex bg-slate-100 p-1 rounded-lg">
                {[
                  { id: "all", label: "全部供采资源" },
                  { id: "domestic", label: "中方优质工厂" },
                  { id: "international", label: "国外(UNGM入网)" }
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSupplierSubTab(s.id as any)}
                    className={`px-4 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                      supplierSubTab === s.id ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 w-full md:w-auto">
                <input
                  type="text"
                  placeholder="搜索企业/产品..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />

                <select
                  value={supplierIndustry}
                  onChange={(e) => setSupplierIndustry(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200"
                >
                  <option value="">{t.allIndustries}</option>
                  {availableSupplierIndustries.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="UNSPSC/UNGM码"
                  value={supplierUngmCodeSearch}
                  onChange={(e) => setSupplierUngmCodeSearch(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200"
                  title="仅适用于国外供应商8位分类码匹配"
                />
              </div>

            </div>

            {/* Suppliers Grid cards view */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {filteredSuppliers.map((sup) => (
                <div
                  key={sup.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-400-shadow-xs hover:shadow-xs flex flex-col justify-between"
                >
                  <div>
                    {/* Header line with tag */}
                    <div className="flex justify-between items-start mb-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          sup.type === "domestic"
                            ? "bg-teal-50 text-teal-700 border border-teal-200"
                            : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                        }`}
                      >
                        {sup.type === "domestic" ? t.supplierTypeDomestic : t.supplierTypeIntl}
                      </span>
                      {sup.status === "pending" ? (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded font-mono font-bold uppercase animate-pulse">待常驻顾问初审</span>
                      ) : (
                        <span className="text-[10px] text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded font-mono font-bold uppercase">已联网核验</span>
                      )}
                    </div>

                    <h4 className="text-base font-extrabold text-slate-800 line-clamp-1">
                      {lang === "zh" ? sup.nameZh : sup.nameEn}
                    </h4>

                    <div className="mt-2 space-y-1.5 text-xs text-slate-500">
                      <p className="flex items-center">
                        <span className="font-extrabold mr-1.5 shrink-0 text-slate-400">{t.location}:</span>
                        <span className="text-slate-700">{lang === "zh" ? `${sup.countryZh} · ${sup.cityZh}` : `${sup.countryEn}, ${sup.cityEn}`}</span>
                      </p>
                      
                      {sup.ungmCode && (
                        <p className="flex items-center text-indigo-700 bg-indigo-50/50 px-2 py-1 rounded inline-block">
                          <span className="font-extrabold mr-1.5 shrink-0">UNGM Code:</span>
                          <span className="font-mono font-black">{sup.ungmCode}</span>
                        </p>
                      )}
                    </div>

                    {/* Products & compliance badges */}
                    <div className="mt-4 border-t border-slate-100 pt-3 space-y-2">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t.mainProducts}</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(lang === "zh" ? sup.mainProductsZh : sup.mainProductsEn).map((p, idx) => (
                            <span key={idx} className="bg-slate-100 text-slate-600 text-[11px] px-2 py-0.5 rounded">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t.complianceLabel}</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(lang === "zh" ? sup.complianceLabelsZh : sup.complianceLabelsEn).map((c, idx) => (
                            <span key={idx} className="bg-emerald-50 text-emerald-800 border border-emerald-100 text-[10px] px-1.5 py-0.5 rounded">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Operational actions: select as target for Gemini matchmaking, or view contact */}
                  <div className="mt-5 pt-3 border-t border-slate-100 flex gap-2">
                    <button
                      onClick={() => {
                        setMatchSelectedSupplier(sup);
                        // Force redirecting to CRM tab to perform AI matchmaking safely
                        setActiveTab(4);
                        triggerAiMatchmaking();
                      }}
                      className="flex-1 py-1.5 bg-gradient-to-tr from-teal-500 to-teal-600 text-white rounded text-xs font-bold hover:from-teal-600 hover:to-teal-700 flex items-center justify-center space-x-1 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>AI 撮合商机</span>
                    </button>
                    <button
                      onClick={() => alert(`联络人: ${sup.contactPerson}\n邮箱: ${sup.contactEmail}\n电话: ${sup.contactPhone}`)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs cursor-pointer"
                    >
                      直接联络
                    </button>
                  </div>

                </div>
              ))}

              {filteredSuppliers.length === 0 && (
                <div className="col-span-full py-12 bg-white rounded-2xl border border-dashed border-slate-200 text-center text-slate-400">
                  <p>{t.noData}</p>
                </div>
              )}

            </div>

          </div>
        )}

        {/* ======================================= */}
        {/* TAB 4: CRM CLIENTS WORKSPACE (客户管理 & 与 CRM 联动) */}
        {/* ======================================= */}
        {activeTab === 4 && (
          <div className="space-y-6">
            
            {/* Top metrics tracker */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { title: t.leadCount, val: leads.length, icon: Activity, col: "text-teal-600 bg-teal-50" },
                { title: t.oppCount, val: OPPORTUNITIES.length, icon: TrendingUp, col: "text-indigo-600 bg-indigo-50" },
                { title: t.clientPool, val: leads.filter(l => l.status === "qualified" || l.status === "contacted").length, icon: Users, col: "text-emerald-600 bg-emerald-50" },
                { title: "跨国跟进节点历史", val: leads.reduce((acc, current) => acc + (current.followUpLogs?.length || 0), 0), icon: Clock, col: "text-amber-600 bg-amber-50" }
              ].map((m, idx) => {
                const Icon = m.icon;
                return (
                  <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                    <p className="text-xs text-slate-400 font-semibold">{m.title}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-2xl font-black text-slate-800">{m.val}</span>
                      <div className={`p-2 rounded-lg ${m.col}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Main CRM Grid split: Active Opportunity Matchmaker & Lead Follow Up History */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: List of Overseas Opportunities & AI smart Matchmaking */}
              <div className="lg:col-span-6 space-y-6">
                
                {/* 1. Smart Outbound Opportunities Hub */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <h3 className="text-base font-extrabold text-slate-800 mb-4 flex items-center justify-between">
                    <span>{t.opportunityHub}</span>
                    <span className="text-xs text-teal-600 font-mono">2026 最新公开标讯</span>
                  </h3>
                  <div className="space-y-4">
                    {OPPORTUNITIES.map((opp) => (
                      <div
                        key={opp.id}
                        onClick={() => setMatchSelectedOpportunity(opp)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer ${
                          matchSelectedOpportunity?.id === opp.id
                            ? "bg-gradient-to-tr from-slate-50 to-teal-55/15 border-teal-500 shadow-sm"
                            : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="bg-indigo-100 text-indigo-800 text-[9px] px-2 py-0.5 rounded font-bold uppercase">
                            {lang === "zh" ? opp.industryZh : opp.industryEn}
                          </span>
                          <span className="text-xs font-semibold text-teal-700">{opp.budget}</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 mt-2 line-clamp-1">
                          {lang === "zh" ? opp.titleZh : opp.titleEn}
                        </h4>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {lang === "zh" ? opp.descriptionZh : opp.descriptionEn}
                        </p>
                        <div className="mt-3 flex justify-between items-center border-t border-slate-200/50 pt-2 text-[11px] text-slate-400">
                          <span>截止日期: {opp.deadline}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSubscribeOpportunity(opp.titleZh);
                            }}
                            className="bg-slate-900 text-white px-2 py-1 rounded hover:bg-slate-800 font-bold"
                          >
                            关注并订阅
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. AI Smart Matchmaking with Gemini */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-slate-100 rounded-2xl p-5 border border-slate-900 shadow-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <div className="bg-teal-500 text-slate-900 p-1.5 rounded-lg">
                        <Sparkles className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-teal-400">{t.aiMatchmaking}</h3>
                        <p className="text-[11px] text-slate-400">基于 Gemini-3.5-flash 与多语言资质智能比对</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">1. 所选出海企业 (Supplier)</span>
                      <select
                        value={matchSelectedSupplier ? matchSelectedSupplier.id : ""}
                        onChange={(e) => {
                          const found = totalSuppliersList.find((x) => x.id === e.target.value);
                          if (found) setMatchSelectedSupplier(found);
                        }}
                        className="bg-slate-700 text-white rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      >
                        {totalSuppliersList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {lang === "zh" ? s.nameZh : s.nameEn}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">2. 特定标讯商机 (Opportunity)</span>
                      <select
                        value={matchSelectedOpportunity ? matchSelectedOpportunity.id : ""}
                        onChange={(e) => {
                          const found = OPPORTUNITIES.find((x) => x.id === e.target.value);
                          if (found) setMatchSelectedOpportunity(found);
                        }}
                        className="bg-slate-700 text-white rounded px-2 py-1 max-w-[200px] truncate focus:outline-none focus:ring-1 focus:ring-teal-500"
                      >
                        {OPPORTUNITIES.map((o) => (
                          <option key={o.id} value={o.id}>
                            {lang === "zh" ? o.titleZh : o.titleEn}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={triggerAiMatchmaking}
                      disabled={isAiMatching}
                      className="w-full py-2.5 mt-2 bg-teal-500 text-slate-955 rounded-lg text-xs font-bold hover:bg-teal-400 transition-colors disabled:opacity-50 cursor-pointer text-center text-slate-900"
                    >
                      {isAiMatching ? t.aiAnalyzing : t.clickAiMatch}
                    </button>
                  </div>

                  {/* Output Generated matching log */}
                  {aiReport && (
                    <div className="mt-4 p-4 rounded-xl bg-slate-800 border border-slate-700/60 text-xs max-h-80 overflow-y-auto leading-relaxed scrollbar-thin">
                      <div className="flex justify-between items-center border-b border-slate-750 pb-1.5 mb-2.5">
                        <span className="font-extrabold text-teal-400">{t.aiMatchingResult}</span>
                        <span className="bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono text-[9px] uppercase">GEMINI PROMPT REPORT</span>
                      </div>
                      <div className="whitespace-pre-wrap text-slate-300 prose prose-invert font-sans space-y-2">
                        {aiReport}
                      </div>
                    </div>
                  )}

                </div>

              </div>

              {/* Right Column: Leads pool & CRM history interactions log tracker */}
              <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-6">
                
                <div>
                  <h3 className="text-base font-extrabold text-slate-800 flex items-center justify-between">
                    <span>{t.leadTracker}</span>
                    <span className="text-[10px] bg-teal-600 text-white font-mono px-2 py-0.5 rounded-full">REALTIME INGESTED</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">展示来自海外展厅申请表、顾问预约、国际采购意向等端口生成的真实云端客户线索。</p>
                </div>

                {isLoadingLeads ? (
                  <div className="text-center py-6 text-slate-400 text-xs animate-pulse">正在从远端拉取最新CRM线索池数据...</div>
                ) : (
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {leads.map((lead) => (
                      <div
                        key={lead.id}
                        onClick={() => setActiveLeadForLog(lead)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                          activeLeadForLog?.id === lead.id
                            ? "bg-slate-50 border-teal-500 shadow-xs"
                            : "border-slate-100 bg-slate-50/20 hover:bg-slate-55"
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <strong className="text-sm text-slate-800 line-clamp-1">{lead.companyName}</strong>
                          <span
                            className={`text-[9px] font-mono px-2 py-0.5 rounded uppercase ${
                              lead.status === "new"
                                ? "bg-rose-100 text-rose-800"
                                : lead.status === "contacted"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {lead.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 mt-2 text-[11px] text-slate-500 border-b border-dashed border-slate-150 pb-2">
                          <p>
                            <strong>主营/类型:</strong> {lead.industry || "未指定"}
                          </p>
                          <p>
                            <strong>国家:</strong> {lead.country || "China"}
                          </p>
                          <p>
                            <strong>联系人:</strong> {lead.contactPerson}
                          </p>
                          <p className="truncate">
                            <strong>联络方式:</strong> {lead.contactMethod}
                          </p>
                        </div>

                        <p className="text-xs text-slate-600 mt-2 bg-white p-2 rounded leading-relaxed border border-slate-100">
                          <strong>诉求备注:</strong> {lead.notes}
                        </p>

                        <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2">
                          <span className="flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            {new Date(lead.createdAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US")}
                          </span>
                          <span className="text-teal-600 hover:underline">
                            包含 {lead.followUpLogs?.length || 0} 条跟进记录 »
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Lead Detailed Interaction Dialog & Custom additions */}
                {activeLeadForLog && (
                  <div className="bg-slate-50 rounded-xl p-4 border border-teal-200 mt-4 space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest text-teal-700">
                        » 正在编辑 & 录入跟进状态: {activeLeadForLog.companyName}
                      </h4>
                      <button
                        onClick={() => setActiveLeadForLog(null)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Timeline logs */}
                    <div>
                      <p className="text-[10px] text-slate-400 font-extrabold pb-2">{t.followUpLogs}</p>
                      {activeLeadForLog.followUpLogs && activeLeadForLog.followUpLogs.length > 0 ? (
                        <div className="space-y-2 max-h-36 overflow-y-auto">
                          {activeLeadForLog.followUpLogs.map((log, lIdx) => (
                            <div key={lIdx} className="bg-white p-2.5 rounded border border-slate-200 text-xs">
                              <div className="flex justify-between text-[10px] text-slate-400">
                                <strong>{log.author}</strong>
                                <span>{log.date}</span>
                              </div>
                              <p className="text-slate-700 mt-1 leading-relaxed">{log.content}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 italic">暂无联络节点，快在下方录入首个转化里程碑。</div>
                      )}
                    </div>

                    {/* Quick Follow up submit Form */}
                    <form onSubmit={addCrmFollowUpLog} className="space-y-2">
                      <div>
                        <textarea
                          placeholder="例如: '已发送中英双语版UNGM Basic认证准备清单，等待对方回执。'"
                          value={newCrmLogEntry}
                          onChange={(e) => setNewCrmLogEntry(e.target.value)}
                          rows={2}
                          className="w-full bg-white border border-slate-200 rounded p-2 text-xs text-slate-755 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          required
                        />
                      </div>

                      <div className="flex gap-2 items-center">
                        <select
                          value={crmLogStatus}
                          onChange={(e) => setCrmLogStatus(e.target.value)}
                          className="px-2 py-1 bg-white border border-slate-200 rounded text-xs"
                        >
                          <option value="">转变客户阶段...</option>
                          <option value="new">🆕 new (未联系)</option>
                          <option value="contacted">📞 contacted (已对接)</option>
                          <option value="qualified">✅ qualified (高意向)</option>
                          <option value="lost">❌ lost (已流失)</option>
                        </select>

                        <button
                          type="submit"
                          className="flex-1 py-1 px-3 bg-slate-900 hover:bg-slate-855 text-white rounded text-xs font-semibold"
                        >
                          录入至 CRM
                        </button>
                      </div>
                    </form>
                  </div>
                )}

              </div>

            </div>

          </div>
        )}

        {/* ======================================= */}
        {/* TAB 5: SERVICES ECO SYSTEM (服务生态) */}
        {/* ======================================= */}
        {activeTab === 5 && (
          <div className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  title: "UNGM 资质代办 & 代注册托管",
                  desc: "帮助中方精密智造、生物制药、环保机械工厂快速完成联合国全球开发署/卫生组织一级或二级资格账户升级，减少多周期退单延误风险。",
                  icon: LayoutGrid,
                  specs: ["英文财务报表制作", "UNSPSC精确对准码", "1对1合规排雷"],
                  active: true
                },
                {
                  title: "海外保税区‘前展后仓’备件物流",
                  desc: "位于法兰克福、迪拜、内罗毕、越南等展厅15公里保税工业园区内，提供样机直接存放、即刻提报、本地送样24小时极速响应。",
                  icon: Globe,
                  specs: ["海外关税退税核验", "常年Bilingual代表接洽", "同城快配配送服务"],
                  active: true
                },
                {
                  title: "中英法阿多文案海牙与使馆认证",
                  desc: "提供专业的进出口通关凭证、测试报告、企业章程法务公证、以及出口目的地海牙或联合国指定认证材料加急翻译代办服务。",
                  icon: FileText,
                  specs: ["使馆背书直连", "特许多语言别名资质印章", "电子化核验通道"],
                  active: true
                },
                {
                  title: "国际大宗标书（中英）翻译与编排",
                  desc: "资深跨国采购代理起草，在履约违约免责声明、不可抗力风险划分、以及联合国劳工福利合规声明上做针对性编排。",
                  icon: BookOpen,
                  specs: ["合规范文填充", "PDF高精度防改编排", "AI辅助匹配预测"],
                  active: true
                },
                {
                  title: "金牌出海企业深度合规培训",
                  desc: "针对合规禁买红线、ESG标准审核、联合国国际劳工保护法、以及防范中东和非洲外汇限额无法结汇的财务防护应对机制全系列培训。",
                  icon: Crown,
                  specs: ["线下高管封闭课", "高频避坑标准教案", "在线视频实案演练"],
                  active: true
                },
                {
                  title: "1v1 全球直联远程会商支持",
                  desc: "为入驻会员搭建的高清远程会议系统，当有国际买家在海外展厅中表现出高度意向时，我们顾问一键接连您与买家实现云端即时在线沟通谈判。",
                  icon: MessageSquare,
                  specs: ["同声即时传译协助", "会商纪要自动创建CRM", "一键订阅商机"],
                  active: true
                }
              ].map((serv, idx) => {
                const Icon = serv.icon;
                return (
                  <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-teal-500 hover:shadow-xs transition-all flex flex-col justify-between">
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold mb-4">
                        <Icon className="w-5 h-5" />
                      </div>
                      <h4 className="text-base font-extrabold text-slate-800">{serv.title}</h4>
                      <p className="text-xs text-slate-500 mt-2 leading-relaxed">{serv.desc}</p>
                      
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">技术指标 / 服务涵盖</span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {serv.specs.map((sp, sIdx) => (
                            <span key={sIdx} className="bg-slate-50 border border-slate-150 text-[10px] text-slate-600 px-2 py-0.5 rounded">
                              {sp}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowConsultForm(true)}
                      className="w-full mt-5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-850 cursor-pointer"
                    >
                      {t.bookServiceNow}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Success milestone tracker slider simulator */}
            <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-md">
              <h4 className="text-sm font-bold text-teal-400 mb-3">{t.successStory}</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="bg-slate-800 p-4 rounded-xl">
                  <span className="text-teal-400 font-mono font-bold">2026.04</span>
                  <p className="font-bold text-slate-200 mt-1">常州精密机床成功在法兰克福样品展厅接单三万套零件采购</p>
                  <p className="text-slate-400 mt-1 select-none">在双语展厅代表接待后，通过CRM一键会商顺利开单。</p>
                </div>
                <div className="bg-slate-800 p-4 rounded-xl">
                  <span className="text-teal-400 font-mono font-bold">2026.03</span>
                  <p className="font-bold text-slate-200 mt-1">非洲水利滴灌系统成套配套设备快速送达多座联合国援助仓</p>
                  <p className="text-slate-400 mt-1 select-none">通过肯尼亚内罗毕物理展厅样品核验，加速通过KEBS国标审定。</p>
                </div>
                <div className="bg-slate-800 p-4 rounded-xl">
                  <span className="text-teal-400 font-mono font-bold">2026.01</span>
                  <p className="font-bold text-slate-200 mt-1">山东某新型装配公司获免税绿皮书，全量中标人道救灾营房项目</p>
                  <p className="text-slate-400 mt-1 select-none">联合顾问在线编制英文投标书，14天成功获得最终入选通知。</p>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ======================================= */}
        {/* TAB 6: LEARNING HUB & ACADEMY (学习区) */}
        {/* ======================================= */}
        {activeTab === 6 && (
          <div className="space-y-6">
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left col: list of articles with membership validation */}
              <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-6">
                
                <div>
                  <h3 className="text-base font-extrabold text-slate-800">联合国与主权采购合规政策学习区</h3>
                  <p className="text-xs text-slate-500 mt-1">整合高价值招标文件、ESG劳工评估测试合规模板及入驻高频白皮书供我国创新厂商自主下载学习。</p>
                </div>

                <div className="space-y-4">
                  {LEARNING_MATERIALS.map((lm) => (
                    <div key={lm.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/40 space-y-3 relative overflow-hidden">
                      {lm.isPremium && (
                        <div className="absolute top-0 right-0">
                          <span className="bg-gradient-to-tr from-amber-500 to-amber-600 text-slate-900 text-[9px] font-black px-2.5 py-1 rounded-bl">
                            {t.membershipRequired}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center space-x-2">
                        <span className="bg-teal-50 text-teal-700 text-[10px] px-2.5 py-0.5 rounded font-bold border border-teal-200">
                          {lang === "zh" ? lm.categoryZh : lm.categoryEn}
                        </span>
                        <span className="text-[11px] text-slate-400">已学习 (下载): {lm.downloadsCount} 次</span>
                      </div>

                      <h4 className="text-sm font-bold text-slate-800 pr-16">
                        {lang === "zh" ? lm.titleZh : lm.titleEn}
                      </h4>

                      <p className="text-xs text-slate-500 leading-relaxed bg-white p-3 rounded border border-slate-100">
                        <strong>概要说明:</strong> {lang === "zh" ? lm.summaryZh : lm.summaryEn}
                      </p>

                      {/* Decisive Area: Validate if this is a Premium document and if user is Gold VIP */}
                      {lm.isPremium && !isVip ? (
                        <div className="bg-amber-150/45 p-3 rounded-lg border border-amber-300 text-xs text-amber-900 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                          <div className="flex items-start space-x-2">
                            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                            <span>{t.lockedPremium}</span>
                          </div>
                          <button
                            onClick={() => setIsVip(true)}
                            className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-3 py-1.5 rounded text-[11px] transition-colors cursor-pointer"
                          >
                            {t.upgradeToVip}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {lm.isPremium && (
                            <div className="bg-emerald-50 text-emerald-800 text-xs p-2.5 rounded border border-emerald-250 flex items-center space-x-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>{t.unlockedPremium}</span>
                            </div>
                          )}

                          <div className="bg-slate-100 p-3 rounded-lg text-xs text-slate-700 font-mono overflow-x-auto leading-relaxed max-h-36 overflow-y-auto">
                            <strong className="block text-[10px] text-slate-400 font-bold uppercase mb-1">文件节选 / 核心内容</strong>
                            {lang === "zh" ? lm.contentZh : lm.contentEn}
                          </div>

                          <div className="flex justify-end gap-2 text-xs pt-1">
                            <button
                              onClick={handleSimulatedDownload}
                              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded font-bold flex items-center space-x-1.5 cursor-pointer"
                            >
                              <FileDown className="w-3.5 h-3.5 text-teal-400" />
                              <span>{t.downloadBtn}</span>
                            </button>
                          </div>
                        </div>
                      )}

                    </div>
                  ))}
                </div>

              </div>

              {/* Right column: general FAQ list */}
              <div className="lg:col-span-4 space-y-6">
                
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <h4 className="text-sm font-bold text-slate-800 mb-3">平台常见采购避坑 FAQ</h4>
                  <div className="space-y-4">
                    {FAQS.map((faq) => (
                      <div key={faq.id} className="border-b border-slate-100 pb-3 last:border-b-0 space-y-1.5">
                        <span className="bg-slate-100 text-slate-600 text-[9px] px-2 py-0.5 rounded font-black font-mono">
                          {faq.category.toUpperCase()}
                        </span>
                        <h5 className="text-xs font-bold text-slate-800">
                          Q: {lang === "zh" ? faq.questionZh : faq.questionEn}
                        </h5>
                        <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded leading-relaxed border border-slate-100/50">
                          {lang === "zh" ? faq.answerZh : faq.answerEn}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* ======================================= */}
        {/* TAB 7: MEMBERSHIP ZONE (会员专区) */}
        {/* ======================================= */}
        {activeTab === 7 && (
          <div className="space-y-6">
            
            {/* VIP Card Display status */}
            <div className="bg-slate-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden border border-slate-800 shadow-lg bg-gradient-to-tr from-slate-950 via-slate-900 to-teal-950">
              <div className="absolute right-0 top-0 translate-x-[20%] translate-y-[-20%] w-80 h-80 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
              
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center space-x-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                    <Crown className="w-3.5 h-3.5" />
                    <span>GOLD VIP ACCESS PANEL</span>
                  </div>
                  <h3 className="text-2xl font-extrabold text-white">尊享平台金牌共采高级会员</h3>
                  <p className="text-xs text-slate-400 max-w-xl">
                    享有全部高级招标文件模板无限畅读下载、AI供采匹配建议不限次生成、系统对接资深联合国顾问1对1会商连线。
                  </p>
                </div>

                <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 text-center space-y-1.5 shrink-0 min-w-56">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t.guestMode}</p>
                  <p className="text-sm font-mono font-bold text-teal-400">{userEmail}</p>

                  <div className="pt-2">
                    {isVip ? (
                      <span className="inline-block px-4 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                        {t.alreadyVip}
                      </span>
                    ) : (
                      <button
                        onClick={() => setIsVip(true)}
                        className="w-full py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 rounded-xl text-xs font-black transition-colors cursor-pointer"
                      >
                        {t.upgradeToVip}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Grid of VIP custom privileges */}
              <div className="mt-8 pt-8 border-t border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                  { title: "全网标讯先知权限", desc: "由于系统直联，您可在标讯对公众公布前3-4天获取相关数据推荐。" },
                  { title: "AI 高精度匹配不限次", desc: "无限次评估您与特定UNGM采购Lot或采购组织需求的兼容度并一建生成报告。" },
                  { title: "展厅实体沙盘展示", desc: "每年免费获赠德国或迪拜、内罗毕展厅内1㎡的实物样品、画册陈列位。" },
                  { title: "1对1出海顾问随行", desc: "针对中英双语、海牙合规、资质加急审核等提供全程跟进陪伴。" }
                ].map((priv, idx) => (
                  <div key={idx} className="space-y-1 bg-slate-850 p-4 rounded-xl border border-slate-800/50">
                    <strong className="text-xs font-bold text-teal-400 block">{priv.title}</strong>
                    <p className="text-[11px] text-slate-400 leading-relaxed select-none">{priv.desc}</p>
                  </div>
                ))}
              </div>

            </div>

            {/* Simulated interactive feedback section */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs text-center max-w-xl mx-auto space-y-4">
              <h4 className="text-base font-extrabold text-slate-800">对高级会员体系存有疑问？</h4>
              <p className="text-xs text-slate-500">
                输入您的企业邮箱，我们可以把详细的多语种权益说明、UNGM合规白皮书全套发至您的邮箱中。
              </p>
              
              <div className="flex gap-2">
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="flex-1 px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <button
                  onClick={() => alert(`已将权益介绍书发送至: ${userEmail}`)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
                >
                  免费发送资料
                </button>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* 4. MODALS & FORMS OVERLAYS */}
      
      {/* OVERLAY A: Overseas Exhibition Hall Register Form */}
      {showShowroomForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200">
            
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center bg-gradient-to-r from-slate-950 to-slate-850">
              <div>
                <h3 className="text-base font-extrabold">
                  {selectedShowroom ? `申请入驻：${selectedShowroom.nameZh}` : "申请海外永久展厅入驻服务"}
                </h3>
                <p className="text-[10px] text-slate-400">我们将为您自动建立 CRM 线索并分派对应展馆的常驻顾问</p>
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
                <h4 className="text-base font-bold text-slate-800">{t.formSuccess}</h4>
                <p className="text-xs text-slate-500">
                  当前处于演示系统，您可以切换到<strong>“客户管理/CRM”</strong>模块查看此项线索的推进及AI跟进细节！
                </p>
              </div>
            ) : (
              <form onSubmit={handleShowroomSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">{t.companyName} *</label>
                    <input
                      type="text"
                      placeholder="中英文工商登记企业名"
                      value={showroomFormInputs.companyName}
                      onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, companyName: e.target.value }))}
                      className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">{t.contactPerson} *</label>
                    <input
                      type="text"
                      placeholder="负责此展出的对接人姓名"
                      value={showroomFormInputs.contactPerson}
                      onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, contactPerson: e.target.value }))}
                      className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">对接方式 (手机号/WhatsApp) *</label>
                    <input
                      type="text"
                      placeholder="以便驻外代表联络"
                      value={showroomFormInputs.contactMethod}
                      onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, contactMethod: e.target.value }))}
                      className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">{t.contactEmail}</label>
                    <input
                      type="email"
                      placeholder="e.g., manager@corp.com"
                      value={showroomFormInputs.email}
                      onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">{t.location} *</label>
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
                        placeholder="主要所在城市"
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
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">核心主营产品群 (逗号隔开) *</label>
                  <input
                    type="text"
                    value={showroomFormInputs.mainProducts}
                    onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, mainProducts: e.target.value }))}
                    placeholder={t.mainProductsPlaceholder}
                    className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    required
                  />
                </div>

                <div className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded border border-slate-150">
                  <input
                    type="checkbox"
                    id="hasUngmC"
                    checked={showroomFormInputs.hasUngm}
                    onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, hasUngm: e.target.checked }))}
                    className="w-4 h-4 text-teal-600 rounded"
                  />
                  <label htmlFor="hasUngmC" className="text-xs text-slate-700 font-bold select-none cursor-pointer">
                    我司已在 UNGM 联合国采购平台注册或意向由平台同步其匹配资质。
                  </label>
                </div>

                {/* Simulated file upload area Drag and Drop */}
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">{t.qualificationFile}</label>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={triggerInputFileClick}
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                      isDragging ? "border-teal-500 bg-teal-50/50" : "border-slate-300 hover:border-slate-400 bg-slate-50/20"
                    }`}
                  >
                    <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-xs text-slate-600 font-semibold">{t.uploadPlaceholder}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">支持PDF、物料白皮书及多文案营业执照。最长限制30MB。</p>

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
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">特定诉求 / 备品仓储诉求</label>
                  <textarea
                    rows={2}
                    value={showroomFormInputs.notes}
                    onChange={(e) => setShowroomFormInputs(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="如需在德国法兰克福保税备件库中租用3个托盘托位..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="text-[11px] text-slate-400">
                  点击提交即同意平台出海服务协议，您的上述所有信息将加密注入高优 CRM。
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
                    {t.cancel}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-teal-650 cursor-pointer"
                  >
                    {t.submitRequestBtn}
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
                <h3 className="text-base font-extrabold">申请注册成为平台认证优质出海供应商</h3>
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
                <h4 className="text-base font-bold text-slate-800">{t.formSuccess}</h4>
                <p className="text-xs text-slate-500">
                  您提交的入驻需求已瞬间分拔并且自动生成一条跟进状态为 <strong>pending</strong> (待初审) 的供应商卡片！
                </p>
              </div>
            ) : (
              <form onSubmit={handleSupplierSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">企业中文名 *</label>
                    <input
                      type="text"
                      value={supplierFormInputs.nameZh}
                      onChange={(e) => setSupplierFormInputs(prev => ({ ...prev, nameZh: e.target.value }))}
                      placeholder="常州恒力精密机床股份有限公司"
                      className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">企业英文法务名</label>
                    <input
                      type="text"
                      value={supplierFormInputs.nameEn}
                      onChange={(e) => setSupplierFormInputs(prev => ({ ...prev, nameEn: e.target.value }))}
                      placeholder="Changzhou Hengli Precision Tooling Co., Ltd."
                      className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">供应商类型 *</label>
                    <select
                      value={supplierFormInputs.type}
                      onChange={(e) => setSupplierFormInputs(prev => ({ ...prev, type: e.target.value }))}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs"
                    >
                      <option value="domestic">{t.supplierTypeDomestic}</option>
                      <option value="international">{t.supplierTypeIntl}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">UNGM Registration Code (如有/非必填)</label>
                    <input
                      type="text"
                      value={supplierFormInputs.ungmCode}
                      onChange={(e) => setSupplierFormInputs(prev => ({ ...prev, ungmCode: e.target.value }))}
                      placeholder="8位 UNSPSC/UNGM 注册码"
                      className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-205"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">产品行业 *</label>
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
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">主要对接人与联系手机 *</label>
                    <input
                      type="text"
                      value={supplierFormInputs.contactPerson}
                      onChange={(e) => setSupplierFormInputs(prev => ({ ...prev, contactPerson: e.target.value, contactPhone: e.target.value }))}
                      placeholder="马永超 manager"
                      className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200"
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">对接常用电子邮箱 *</label>
                    <input
                      type="email"
                      value={supplierFormInputs.contactEmail}
                      onChange={(e) => setSupplierFormInputs(prev => ({ ...prev, contactEmail: e.target.value }))}
                      placeholder="name@company.com"
                      className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200"
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">主营产品中文清单 (英文逗号隔开) *</label>
                    <input
                      type="text"
                      value={supplierFormInputs.mainProductsZh}
                      onChange={(e) => setSupplierFormInputs(prev => ({ ...prev, mainProductsZh: e.target.value, mainProductsEn: e.target.value }))}
                      placeholder="五轴加工,数控铣刀"
                      className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200"
                      required
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
                    {t.cancel}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
                  >
                    立即提交注册申请
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
              <h3 className="text-sm font-extrabold">预约海外顾问 1v1 精准直连会商</h3>
              <button onClick={() => setShowConsultForm(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {consultFormSubmitted ? (
              <div className="p-8 text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-teal-600 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">已为您成功预约！</h4>
                <p className="text-xs text-slate-500">
                  我们已经派发了相应的商务排程到您的手机中，请查收通知。
                </p>
              </div>
            ) : (
              <form onSubmit={handleConsultSubmit} className="p-5 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">预约企业名称 *</label>
                  <input
                    type="text"
                    name="companyName"
                    placeholder="请输入完整的企业名"
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">对接人姓名 *</label>
                  <input
                    type="text"
                    name="contactPerson"
                    placeholder="例如: 林经理"
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">手机号码 / WhatsApp *</label>
                  <input
                    type="text"
                    name="phone"
                    placeholder="+86 138-xxxx-xxxx"
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">需要咨询的具体出海难点或诉求</label>
                  <textarea
                    name="notes"
                    rows={2}
                    placeholder="如: 我司生产医疗包装袋，需要了解UNGM Level1 的最低财务申报流和海外展厅展示费率。"
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowConsultForm(false)}
                    className="px-3 py-1.5 border border-slate-200 text-slate-400 rounded text-xs"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800"
                  >
                    立即提交预约
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
          title="预约海外顾问"
        >
          <MessageSquare className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <footer className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200/80 shadow-lg py-1 flex justify-around items-center">
        {[
          { id: 1, label: "展厅", icon: Building2 },
          { id: 2, label: "共采", icon: Globe },
          { id: 3, label: "供应商", icon: Users },
          { id: 4, label: "CRM", icon: Briefcase },
          { id: 6, label: "学习", icon: BookOpen }
        ].map((tab) => {
          const IconComp = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center w-14 py-1 text-[10px] font-semibold transition-colors ${
                activeTab === tab.id ? "text-teal-600 font-bold" : "text-slate-400"
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
          <p>© 2026 全球共采与海外展厅协同网络协同云平台. All Rights Reserved.</p>
          <div className="flex space-x-4">
            <span className="hover:underline cursor-pointer">服务协议</span>
            <span className="hover:underline cursor-pointer">隐私保护</span>
            <span className="hover:underline cursor-pointer">UNSPSC 标准网盟</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
