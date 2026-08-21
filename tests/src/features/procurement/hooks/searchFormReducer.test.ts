/**
 * src/features/procurement/hooks/searchFormReducer.ts 测试
 */
import { describe, it, expect } from "vitest";
import { searchFormReducer, type SearchFormState } from "../../../../../src/features/procurement/hooks/searchFormReducer";

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
  it("set_q 更新关键词", () => {
    const state = searchFormReducer(initialState, { type: "set_q", payload: "test" });
    expect(state.q).toBe("test");
  });

  it("set_q 截断超长输入（200 字符）", () => {
    const long = "a".repeat(300);
    const state = searchFormReducer(initialState, { type: "set_q", payload: long });
    expect(state.q.length).toBe(200);
  });

  it("set_country 更新国家", () => {
    const state = searchFormReducer(initialState, { type: "set_country", payload: "China" });
    expect(state.country).toBe("China");
  });

  it("set_agency 更新机构", () => {
    const state = searchFormReducer(initialState, { type: "set_agency", payload: "UNDP" });
    expect(state.agency).toBe("UNDP");
  });

  it("set_from / set_to 更新日期范围", () => {
    let state = searchFormReducer(initialState, { type: "set_from", payload: "2026-01-01" });
    expect(state.from).toBe("2026-01-01");
    state = searchFormReducer(state, { type: "set_to", payload: "2026-12-31" });
    expect(state.to).toBe("2026-12-31");
  });

  it("set_window 更新时间窗口", () => {
    const state = searchFormReducer(initialState, { type: "set_window", payload: "30" });
    expect(state.window).toBe("30");
  });

  it("set_type 更新公告类型", () => {
    const state = searchFormReducer(initialState, { type: "set_type", payload: "ITB" });
    expect(state.type).toBe("ITB");
  });

  it("sync 整体替换状态", () => {
    const newState: SearchFormState = {
      q: "hello",
      country: "US",
      agency: "WB",
      from: "2026-01-01",
      to: "2026-06-30",
      window: "60",
      type: "RFQ",
    };
    const state = searchFormReducer(initialState, { type: "sync", payload: newState });
    expect(state).toEqual(newState);
  });

  it("clear 重置所有字段", () => {
    const filled: SearchFormState = {
      q: "test",
      country: "CN",
      agency: "ADB",
      from: "2026-01-01",
      to: "2026-12-31",
      window: "90",
      type: "RFP",
    };
    const state = searchFormReducer(filled, { type: "clear" });
    expect(state).toEqual(initialState);
  });

  it("未知 action 返回当前状态", () => {
    const state = searchFormReducer(initialState, { type: "unknown" } as any);
    expect(state).toBe(initialState);
  });
});
