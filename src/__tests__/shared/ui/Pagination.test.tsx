/**
 * shared/ui/Pagination 组件测试
 * Tests for the shared Pagination component (promoted from procurement)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Pagination } from "@/shared/ui";
import { LocaleProvider } from "@/core/i18n";

const renderIt = (props: Partial<React.ComponentProps<typeof Pagination>> = {}) =>
  render(
    <LocaleProvider>
      <Pagination page={2} totalPages={5} serverPageSize={9} total={45}
        loading={false} onPageChange={props.onPageChange ?? (() => {})} {...props} />
    </LocaleProvider>,
  );

describe("shared/ui/Pagination", () => {
  it("calls onPageChange with previous page", () => {
    const onPageChange = vi.fn();
    renderIt({ onPageChange });
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
  it("disables next button on last page", () => {
    renderIt({ page: 5 });
    const buttons = screen.getAllByRole("button");
    expect(buttons[buttons.length - 1]).toBeDisabled();
  });
});
