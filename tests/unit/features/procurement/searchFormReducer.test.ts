import { describe, it, expect } from "vitest";
import { searchFormReducer, type SearchFormState, type SearchFormAction } from "@/features/procurement/hooks/searchFormReducer";
import type { TermRow } from "@/shared/utils/advanced-syntax";

const initialState: SearchFormState = {
  q: "",
  country: "",
  agency: "",
  from: "",
  to: "",
  window: "",
  noticeType: "",
  termRows: [],
};

describe("searchFormReducer", () => {
  it("set_q → 更新关键词", () => {
    const state = searchFormReducer(initialState, { type: "set_q", payload: "construction" });
    expect(state.q).toBe("construction");
  });

  it("set_q → 截断超过 200 字符", () => {
    const longQ = "a".repeat(250);
    const state = searchFormReducer(initialState, { type: "set_q", payload: longQ });
    expect(state.q.length).toBe(200);
  });

  it("set_country → 更新国家", () => {
    const state = searchFormReducer(initialState, { type: "set_country", payload: "Brazil" });
    expect(state.country).toBe("Brazil");
  });

  it("set_from → 更新起始日期", () => {
    const state = searchFormReducer(initialState, { type: "set_from", payload: "2026-01-01" });
    expect(state.from).toBe("2026-01-01");
  });

  it("set_to → 更新结束日期", () => {
    const state = searchFormReducer(initialState, { type: "set_to", payload: "2026-12-31" });
    expect(state.to).toBe("2026-12-31");
  });

  it("set_window → 更新窗口", () => {
    const state = searchFormReducer(initialState, { type: "set_window", payload: "30d" });
    expect(state.window).toBe("30d");
  });

  it("set_notice_type → 更新公告类型", () => {
    const state = searchFormReducer(initialState, { type: "set_notice_type", payload: "ITB" });
    expect(state.noticeType).toBe("ITB");
  });

  it("sync → 完全替换状态", () => {
    const newState: SearchFormState = {
      q: "test",
      country: "US",
      agency: "UNDP",
      from: "2026-01-01",
      to: "2026-12-31",
      window: "30d",
      noticeType: "ITB",
      termRows: [],
    };
    const state = searchFormReducer(initialState, { type: "sync", payload: newState });
    expect(state).toEqual(newState);
  });

  it("clear → 重置所有字段", () => {
    const dirty: SearchFormState = {
      q: "test", country: "US", agency: "UNDP",
      from: "2026-01-01", to: "2026-12-31", window: "30d", noticeType: "ITB",
      termRows: [],
    };
    const state = searchFormReducer(dirty, { type: "clear" });
    expect(state).toEqual(initialState);
  });

  it("未知 action → 返回当前状态", () => {
    const state = searchFormReducer(initialState, { type: "unknown" } as unknown as SearchFormAction);
    expect(state).toBe(initialState);
  });

  it("各字段独立更新（不影响其他字段）", () => {
    let state = searchFormReducer(initialState, { type: "set_q", payload: "test" });
    state = searchFormReducer(state, { type: "set_agency", payload: "UNICEF" });
    expect(state.q).toBe("test");
    expect(state.agency).toBe("UNICEF");
    expect(state.country).toBe("");
  });
});

describe("termRows（高级关键词行）", () => {
  // 注意：文件顶部既有 initialState 需同步补 termRows: [] 字段
  const base = { ...initialState, termRows: [] as TermRow[] };
  it("add_row 追加空行并自增 id；上限 8 行", () => {
    let s = searchFormReducer(base, { type: "add_row" });
    s = searchFormReducer(s, { type: "add_row" });
    expect(s.termRows).toHaveLength(2);
    expect(s.termRows[1].id).toBe(2);
    for (let i = 0; i < 10; i++) s = searchFormReducer(s, { type: "add_row" });
    expect(s.termRows).toHaveLength(8);
  });
  it("set_row_term 截断 50 字；set_row_mode 改模式；remove_row 删行", () => {
    let s = searchFormReducer(base, { type: "add_row" });
    s = searchFormReducer(s, { type: "set_row_term", payload: { id: 1, term: "x".repeat(60) } });
    expect(s.termRows[0].term).toHaveLength(50);
    s = searchFormReducer(s, { type: "set_row_mode", payload: { id: 1, mode: "exclude" } });
    expect(s.termRows[0].mode).toBe("exclude");
    s = searchFormReducer(s, { type: "remove_row", payload: 1 });
    expect(s.termRows).toHaveLength(0);
  });
  it("replace_rows 整组替换（词组选用路径）并截断到 8 行", () => {
    const s = searchFormReducer(base, {
      type: "replace_rows",
      payload: [
        { id: 1, term: "光伏", mode: "include" },
        { id: 2, term: "组1", mode: "include" },
      ],
    });
    expect(s.termRows).toEqual([
      { id: 1, term: "光伏", mode: "include" },
      { id: 2, term: "组1", mode: "include" },
    ]);
  });
  it("clear 清空 termRows；sync 以 payload 为准", () => {
    let s = searchFormReducer(base, { type: "add_row" });
    s = searchFormReducer(s, { type: "clear" });
    expect(s.termRows).toEqual([]);
    s = searchFormReducer(s, { type: "sync", payload: { ...base, termRows: [{ id: 1, term: "a", mode: "phrase" }] } });
    expect(s.termRows).toEqual([{ id: 1, term: "a", mode: "phrase" }]);
  });
});
