import { describe, it, expect } from "vitest";
import { searchFormReducer, type SearchFormState, type SearchFormAction } from "./hooks/searchFormReducer";

const initialState: SearchFormState = {
  q: "",
  country: "",
  agency: "",
  from: "",
  to: "",
  window: "",
  type: "",
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

  it("set_type → 更新类型", () => {
    const state = searchFormReducer(initialState, { type: "set_type", payload: "ITB" });
    expect(state.type).toBe("ITB");
  });

  it("sync → 完全替换状态", () => {
    const newState: SearchFormState = {
      q: "test",
      country: "US",
      agency: "UNDP",
      from: "2026-01-01",
      to: "2026-12-31",
      window: "30d",
      type: "ITB",
    };
    const state = searchFormReducer(initialState, { type: "sync", payload: newState });
    expect(state).toEqual(newState);
  });

  it("clear → 重置所有字段", () => {
    const dirty: SearchFormState = {
      q: "test", country: "US", agency: "UNDP",
      from: "2026-01-01", to: "2026-12-31", window: "30d", type: "ITB",
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
