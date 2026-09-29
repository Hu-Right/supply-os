/**
 * AdvancedSearchPanel「我的词组」下拉加载契约测试
 * @module tests/unit/features/procurement/components/AdvancedSearchPanel.keywordGroups.test
 * @description 不 mock API 模块，只 stub fetch，从而把「点开下拉到底发几次网络请求」这一
 *              真实性能指标钉在渲染层（缓存层的行为另有 keywordGroups.test.ts 覆盖）：
 *              ① 请求未完成时给加载占位，而非整块空白（旧实现 !data ? null）；
 *              ② TTL 内二次点开只发一次请求 —— 打开延迟的根因（此前每次点开都全量查询）；
 *              ③ 失败呈现为「可重试」，不再伪装成无权益的「去管理词组」空态；
 *              ④ 换账号后重新发请求，且不得把上一位用户的词组留在面板里。
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

/** 词组读接口信封：groups 名字带序号，便于断言「显示的是谁的词组」 */
function groupsResponse(n: number) {
  return Response.json({
    code: 0,
    message: "ok",
    data: {
      entitled: true,
      groups: [{ id: n, name: `用户${n}的词组`, terms: ["光伏", "逆变器"] }],
    },
  });
}

function makeForm() {
  const rows: TermRow[] = [];
  return {
    qInput: "", setQInput: vi.fn(),
    countryInput: "", setCountryInput: vi.fn(),
    agencyInput: "", setAgencyInput: vi.fn(),
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

/** 面板元素：rerender 时复用同一份 props，保持组件实例（换账号分支必须走同一实例才成立） */
function panel(form: ReturnType<typeof makeForm>) {
  return (
    <AdvancedSearchPanel
      form={form as never}
      query={{} as never}
      countries={[]}
      agencies={[]}
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

/** 触发器点一下=开，再点一下=关（Radix 语义）：用例里要么成对点，要么显式收起 */
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
    let resolveFetch!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((res) => { resolveFetch = res; }));
    renderPanel();
    openPicker();

    // 旧实现此处渲染 null：弹层打开却什么都没有，用户感知为「卡住」
    expect(screen.getByText("uiLoadingDots")).toBeTruthy();

    act(() => resolveFetch(groupsResponse(1)));
    await waitFor(() => expect(screen.getByText("用户1的词组")).toBeTruthy());
  });

  it("TTL 内二次点开只发一次请求（打开延迟根因）", async () => {
    fetchMock.mockResolvedValue(groupsResponse(1));
    renderPanel();

    openPicker();
    await waitFor(() => expect(screen.getByText("用户1的词组")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 收起再点开：命中缓存，不再打网络，也不再触发服务端权益 3 查 + 列表 1 查
    await closePicker();
    openPicker();
    await waitFor(() => expect(screen.getByText("用户1的词组")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("用户1的词组"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("请求失败呈现为可重试，不伪装成无权益空态", async () => {
    fetchMock.mockResolvedValue(Response.json({ code: 50000, message: "服务器内部错误" }, { status: 500 }));
    renderPanel();
    openPicker();

    await waitFor(() => expect(screen.getByTestId("kw-group-retry")).toBeTruthy());
    // 「去管理词组」空态是无权益/无数据的语义，网络故障不该走到这条分支
    expect(screen.queryByText("procurement_manageKeywordGroups")).toBeNull();

    // 点重试：恢复后正常渲染
    fetchMock.mockResolvedValue(groupsResponse(2));
    fireEvent.click(screen.getByTestId("kw-group-retry"));
    await waitFor(() => expect(screen.getByText("用户2的词组")).toBeTruthy());
  });

  it("换账号后重新发请求，且不残留上一位用户的词组", async () => {
    fetchMock.mockResolvedValueOnce(groupsResponse(1));
    const view = renderPanel();
    openPicker();
    await waitFor(() => expect(screen.getByText("用户1的词组")).toBeTruthy());
    await closePicker();

    // 同一实例上切换身份：缓存键只有 URL，词组却是私有数据，必须失效重取
    identity.currentUserId = 2;
    fetchMock.mockResolvedValueOnce(groupsResponse(2));
    view.rerender(panel(view.form));
    await waitFor(() => expect(screen.queryByText("用户1的词组")).toBeNull());

    openPicker();
    await waitFor(() => expect(screen.getByText("用户2的词组")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("用户1的词组")).toBeNull();
  });
});
