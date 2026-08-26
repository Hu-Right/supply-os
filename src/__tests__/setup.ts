/**
 * vitest 全局 setup（jsdom 环境）
 *
 * @description 全局 mock：i18n / auth / events / router / lucide-react 等。
 *              组件测试文件可直接使用，无需重复 vi.mock。
 */
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// ── 全局 mock: @/core/i18n ──
const _mockT = vi.fn((key: string) => key);
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: _mockT, locale: "en", setLocale: vi.fn(), dir: "ltr" }),
  SUPPORTED_LOCALES: [
    { code: "zh", nativeName: "中文", englishName: "Chinese", dir: "ltr" },
    { code: "en", nativeName: "English", englishName: "English", dir: "ltr" },
    { code: "fr", nativeName: "Français", englishName: "French", dir: "ltr" },
    { code: "ru", nativeName: "Русский", englishName: "Russian", dir: "ltr" },
    { code: "es", nativeName: "Español", englishName: "Spanish", dir: "ltr" },
    { code: "ar", nativeName: "العربية", englishName: "Arabic", dir: "rtl" },
  ],
  SUPPORTED_LOCALE_CODES: ["zh", "en", "fr", "ru", "es", "ar"],
  getLocaleDir: (code: string) => (code === "ar" ? "rtl" : "ltr"),
  pickLocale: () => "en",
  detectDomininantScript: () => "Latin" as const,
  needsContentTranslation: () => false,
  LocaleProvider: ({ children }: { children: unknown }) => children,
  initI18n: vi.fn(),
  setupI18nSync: vi.fn(),
  loadInitialLanguages: vi.fn(),
}));

// ── 全局 mock: @/core/auth ──
vi.mock("@/core/auth", () => ({
  useAuth: () => ({ authUser: null, isVip: false, login: vi.fn(), logout: vi.fn() }),
  AuthProvider: ({ children }: { children: unknown }) => children,
  useOptionalAuth: () => null,
}));

// ── 全局 mock: @/core/events ──
vi.mock("@/core/events", () => ({
  emitAppEvent: vi.fn(),
  onAppEvent: vi.fn(() => () => {}),
}));

// ── 全局 mock: useMembershipTier ──
vi.mock("@/features/membership/hooks/useMembershipTier", () => ({
  useMembershipTier: () => ({
    tierLabel: "",
    currentPlanCode: null,
    currentPlanPrice: null,
    currentPlanName: null,
  }),
}));

// ── 全局 mock: react-router-dom ──
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/showroom", search: "", hash: "", state: null, key: "" }),
  Navigate: () => null,
  Link: ({ children }: { children: unknown }) => children,
}));

// ── 全局 mock: @/core/http (apiCached/api) ──
// 保留 ApiError 等真实导出，仅 mock 网络请求函数
vi.mock("@/core/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/http")>();
  return {
    ...actual,
    apiCached: vi.fn(() => Promise.resolve({})),
    api: vi.fn(() => Promise.resolve({})),
  };
});

// ── 全局 mock: @/routes (preloadRoute) ──
vi.mock("@/routes", () => ({
  preloadRoute: vi.fn(),
}));

// ── 全局 mock: lucide-react → 轻量占位组件 ──
const _StubIcon = () => null;
vi.mock("lucide-react", () => ({
  __esModule: true,
  default: _StubIcon,
  // 所有组件中使用的图标统一返回同一个占位组件
  Building2: _StubIcon, BookOpen: _StubIcon, Briefcase: _StubIcon,
  Brain: _StubIcon, CalendarDays: _StubIcon, Check: _StubIcon, CheckCircle2: _StubIcon,
  ChevronDown: _StubIcon, ChevronLeft: _StubIcon, ChevronRight: _StubIcon,
  Crown: _StubIcon, FileSearch: _StubIcon, FileText: _StubIcon,
  Globe: _StubIcon, GraduationCap: _StubIcon, Inbox: _StubIcon,
  Layers: _StubIcon, LayoutGrid: _StubIcon, MapPin: _StubIcon, Menu: _StubIcon,
  MessageCircle: _StubIcon, MessageSquare: _StubIcon, Network: _StubIcon, Play: _StubIcon,
  Plus: _StubIcon, Quote: _StubIcon, ScrollText: _StubIcon, Search: _StubIcon,
  Send: _StubIcon, ShieldCheck: _StubIcon, BadgeCheck: _StubIcon, Target: _StubIcon,
  TrendingUp: _StubIcon, Upload: _StubIcon, Users: _StubIcon,
  WifiOff: _StubIcon, X: _StubIcon,
  Zap: _StubIcon, Star: _StubIcon,
  ArrowLeft: _StubIcon, AlertCircle: _StubIcon, ExternalLink: _StubIcon,
  Loader2: _StubIcon, Smartphone: _StubIcon, Unlink: _StubIcon,
  Filter: _StubIcon,
  CreditCard: _StubIcon, Shield: _StubIcon, Clock: _StubIcon,
}));

// jsdom 不提供 matchMedia，前端组件测试常用兜底
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

export {};
