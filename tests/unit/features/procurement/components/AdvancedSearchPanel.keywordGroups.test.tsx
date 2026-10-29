/**
 * AdvancedSearchPanel 词组选择器（双分区）加载契约测试
 * @module tests/unit/features/procurement/components/AdvancedSearchPanel.keywordGroups.test
 * @description 不 mock API 模块，只 stub fetch（按 URL 分流），把点开弹层的网络行为钉在渲染层：
 *              ① 我的词组：请求在途给占位、TTL 内二次点开不再打网络、失败呈「可重试」非空态、
 *                 换账号失效重取且不残留上一位词组；
 *              ② 官方精选：随弹层并行加载、点选走同一 onPick、**换账号不失效**（公开数据与账号无关）。
 *              t 返回 key 本身，断言以 key 字符串进行。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { clearApiCache } from "@/core/http";

vi.mock("@/core/perf", () => ({ recordApiMetric: vi.fn() }));

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

// 可变身份：测试内改写 currentUserId 后重渲染即可触发组件的换账号失效分支
const identity = { currentUserId: undefined as number | undefined };
vi.mock("@/core/auth/useUserId", () => ({ useUserId: () => identity.currentUserId }));

import { AdvancedSearchPanel } from "@/features/procurement/components/AdvancedSearchPanel";
import type { TermRow } from "@/shared/utils/advanced-syntax";

const fetchMock = vi.fn<typeof fetch>();

const USER_URL = "/api/user/keyword-groups";
const OFF_URL = "/api/keyword-groups/official";

/** 我的词组读接口裸载荷：名字带序号，便于断言「显示的是谁的词组」 */
function userResp(n: number) {
  return Response.json({
    entitled: true,
    groups: [{ id: n, name: `用户${n}的词组`, terms: ["光伏", "逆变器"] }],
  });
}
/** 官方精选读接口裸载荷：名字与用户区分明，避免 getByText 撞名 */
function offResp() {
  return Response.json({
    groups: [{ id: 101, name: "官方X", terms: ["组件"], categoryCode: "energy", sortOrder: 0 }],
  });
}

/** 默认路由：两区各自成功 */
const bothOk = () =>
  fetchMock.mockImplementation((input: unknown) =>
    Promise.resolve(String(input).includes(OFF_URL) ? offResp() : userResp(1)),
  );

const userCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).includes(USER_URL)).length;
const officialCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).includes(OFF_URL)).length;

function makeForm() {
  const rows: TermRow[] = [];
  return {
    qInput: "", setQInput: vi.fn(),
    countryInput: "", setCountryInput: vi.fn(),
    fromInput: "", setFromInput: vi.fn(),
    toInput: "", setToInput: vi.fn(),
    windowInput: "", setWindowInput: vi.fn(),
    noticeTypeInput: "", setNoticeTypeInput: vi.fn(),
    termRows: rows,
    matchMode: "all" as const,
    setMatchMode: vi.fn(),
    addRow: vi.fn(),
    removeRow: vi.fn(),
    replaceRows: vi.fn(),
    setRowTerm: vi.fn(),
    setRowMode: vi.fn(),
  };
}

function panel(form: ReturnType<typeof makeForm>) {
  return (
    <AdvancedSearchPanel
      form={form as never}
      query={{} as never}
      countries={[]}
      applySearch={vi.fn() as never}
      clearSearch={vi.fn()}
      toggleFeatured={vi.fn()}
      keywordLibEntitled
      advancedSearchEntitled
    />
  );
}

function renderPanel(form = makeForm()) {
  return { form, ...render(panel(form)) };
}

const openPicker = () => fireEvent.click(screen.getByTestId("kw-group-picker"));
const closePicker = async () => {
  fireEvent.click(screen.getByTestId("kw-group-picker"));
  await waitFor(() => expect(screen.queryByText("用户1的词组")).toBeNull());
};

beforeEach(() => {
  clearApiCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  identity.currentUserId = 1;
});

afterEach(() => {
  clearApiCache();
  identity.currentUserId = undefined;
  vi.unstubAllGlobals();
});

describe("「我的词组」下拉加载", () => {
  it("请求在途时显示加载占位，而不是整块空白", async () => {
    let resolveUser!: (r: Response) => void;
    fetchMock.mockImplementation((input: unknown) => {
      if (String(input).includes(OFF_URL)) return Promise.resolve(offResp());
      return new Promise<Response>((res) => { resolveUser = res; });
    });
    renderPanel();
    openPicker();

    expect(screen.getByText("uiLoadingDots")).toBeTruthy();

    act(() => resolveUser(userResp(1)));
    await waitFor(() => expect(screen.getByText("用户1的词组")).toBeTruthy());
  });

  it("TTL 内二次点开只发一次（我的+官方各一次），点开延迟根因", async () => {
    bothOk();
    renderPanel();

    openPicker();
    await waitFor(() => expect(screen.getByText("用户1的词组")).toBeTruthy());
    expect(userCalls()).toBe(1);
    expect(officialCalls()).toBe(1);

    await closePicker();
    openPicker();
    await waitFor(() => expect(screen.getByText("用户1的词组")).toBeTruthy());
    expect(userCalls()).toBe(1); // 命中缓存，不再打网络
    expect(officialCalls()).toBe(1);
  });

  it("我的词组请求失败呈现为可重试，不伪装成无权益空态", async () => {
    fetchMock.mockImplementation((input: unknown) =>
      Promise.resolve(
        String(input).includes(OFF_URL)
          ? offResp()
          : Response.json({ code: 50000, message: "服务器内部错误" }, { status: 500 }),
      ),
    );
    renderPanel();
    openPicker();

    await waitFor(() => expect(screen.getByTestId("kw-group-retry")).toBeTruthy());
    expect(screen.queryByText("procurement_manageKeywordGroups")).toBeNull();

    bothOk();
    fireEvent.click(screen.getByTestId("kw-group-retry"));
    await waitFor(() => expect(screen.getByText("用户1的词组")).toBeTruthy());
  });

  it("换账号后我的词组重新发请求且不残留；官方区不失效（公开数据）", async () => {
    bothOk();
    const view = renderPanel();
    openPicker();
    await waitFor(() => expect(screen.getByText("用户1的词组")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("官方X")).toBeTruthy());
    await closePicker();

    identity.currentUserId = 2;
    fetchMock.mockImplementation((input: unknown) =>
      Promise.resolve(String(input).includes(OFF_URL) ? offResp() : userResp(2)),
    );
    view.rerender(panel(view.form));
    await waitFor(() => expect(screen.queryByText("用户1的词组")).toBeNull());

    openPicker();
    await waitFor(() => expect(screen.getByText("用户2的词组")).toBeTruthy());
    expect(userCalls()).toBe(2);      // 换账号失效重取
    expect(officialCalls()).toBe(1);  // 官方区跨账号保留，不再请求
    expect(screen.getByText("官方X")).toBeTruthy();
  });
});

describe("「官方精选」区", () => {
  it("无权益也能进弹层看到官方区；我的词组区显示锁定入口", async () => {
    bothOk();
    const form = makeForm();
    render(
      <AdvancedSearchPanel
        form={form as never}
        query={{} as never}
        countries={[]}
        applySearch={vi.fn() as never}
        clearSearch={vi.fn()}
        toggleFeatured={vi.fn()}
        keywordLibEntitled={false}
        advancedSearchEntitled={false}
      />,
    );
    openPicker();
    await waitFor(() => expect(screen.getByText("官方X")).toBeTruthy());
    // 无权益：我的词组区呈锁定入口（点击才弹升级框），官方区仍可选用
    expect(screen.getByTestId("kw-group-locked")).toBeTruthy();
  });

  it("点官方词组 → 整组灌入 onPick（replaceRows），与我的词组同一路径", async () => {
    bothOk();
    const form = makeForm();
    renderPanel(form);
    openPicker();
    await waitFor(() => expect(screen.getByText("官方X")).toBeTruthy());
    fireEvent.click(screen.getByText("官方X"));
    expect(form.replaceRows).toHaveBeenCalledTimes(1);
    const rows = form.replaceRows.mock.calls[0][0] as TermRow[];
    expect(rows.map((r) => r.term)).toEqual(["组件"]);
    expect(rows.every((r) => r.mode === "include")).toBe(true);
  });
});
