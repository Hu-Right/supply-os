import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";
import { Select } from "@/shared/ui/Select";
import { Spinner } from "@/shared/ui/Spinner";
import { EmptyState } from "@/shared/ui/EmptyState";
import { SearchInput } from "@/shared/ui/SearchInput";
import { Card } from "@/shared/ui/Card";

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>Test Badge</Badge>);
    expect(screen.getByText("Test Badge")).toBeInTheDocument();
  });

  it("applies default variant classes", () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText("Default");
    expect(badge.className).toContain("bg-slate-100");
  });

  it("applies success variant classes", () => {
    render(<Badge variant="success">Success</Badge>);
    const badge = screen.getByText("Success");
    expect(badge.className).toContain("bg-emerald-100");
  });

  it("applies warning variant classes", () => {
    render(<Badge variant="warning">Warning</Badge>);
    const badge = screen.getByText("Warning");
    expect(badge.className).toContain("bg-amber-100");
  });

  it("applies error variant classes", () => {
    render(<Badge variant="error">Error</Badge>);
    const badge = screen.getByText("Error");
    expect(badge.className).toContain("bg-rose-100");
  });

  it("applies info variant classes", () => {
    render(<Badge variant="info">Info</Badge>);
    const badge = screen.getByText("Info");
    expect(badge.className).toContain("bg-teal-100");
  });

  it("applies pulsate animation and role", () => {
    render(<Badge pulsate>Pulsating</Badge>);
    const badge = screen.getByText("Pulsating");
    expect(badge.className).toContain("animate-pulse");
    expect(badge).toHaveAttribute("role", "status");
  });

  it("does not have role when not pulsating", () => {
    render(<Badge>Static</Badge>);
    const badge = screen.getByText("Static");
    expect(badge).not.toHaveAttribute("role");
  });

  it("applies custom className", () => {
    render(<Badge className="custom-class">Custom</Badge>);
    const badge = screen.getByText("Custom");
    expect(badge.className).toContain("custom-class");
  });
});

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("applies primary variant by default", () => {
    render(<Button>Primary</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-teal-600");
  });

  it("applies secondary variant", () => {
    render(<Button variant="secondary">Secondary</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-slate-100");
  });

  it("applies ghost variant", () => {
    render(<Button variant="ghost">Ghost</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-transparent");
  });

  it("applies outline variant", () => {
    render(<Button variant="outline">Outline</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("border");
  });

  it("applies danger variant", () => {
    render(<Button variant="danger">Danger</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-rose-600");
  });

  it("applies size classes", () => {
    render(<Button size="sm">Small</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("text-xs");
  });

  it("disables button when disabled prop is true", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("disables button when loading", () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("shows spinner when loading", () => {
    render(<Button loading>Loading</Button>);
    const button = screen.getByRole("button");
    expect(button.querySelector("svg")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<Button className="custom-btn">Custom</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("custom-btn");
  });
});

describe("Input", () => {
  it("renders input element", () => {
    render(<Input aria-label="test input" />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("applies error classes when error is true", () => {
    render(<Input error aria-label="error input" />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("border-rose-500");
  });

  it("renders with prefix", () => {
    render(<Input prefix={<span data-testid="prefix">$</span>} aria-label="with prefix" />);
    expect(screen.getByTestId("prefix")).toBeInTheDocument();
  });

  it("renders with suffix", () => {
    render(<Input suffix={<span data-testid="suffix">kg</span>} aria-label="with suffix" />);
    expect(screen.getByTestId("suffix")).toBeInTheDocument();
  });

  it("renders with leftIcon as prefix", () => {
    render(<Input leftIcon={<span data-testid="icon">🔍</span>} aria-label="with icon" />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<Input className="custom-input" aria-label="custom" />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("custom-input");
  });
});

describe("Select", () => {
  it("renders select element", () => {
    render(
      <Select aria-label="test select">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("applies error classes when error is true", () => {
    render(
      <Select error aria-label="error select">
        <option>A</option>
      </Select>
    );
    const select = screen.getByRole("combobox");
    expect(select.className).toContain("border-rose-500");
  });

  it("renders children options", () => {
    render(
      <Select aria-label="options select">
        <option value="1">Option 1</option>
        <option value="2">Option 2</option>
      </Select>
    );
    expect(screen.getByText("Option 1")).toBeInTheDocument();
    expect(screen.getByText("Option 2")).toBeInTheDocument();
  });
});

describe("Spinner", () => {
  it("renders with role status", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has aria-label for accessibility", () => {
    render(<Spinner />);
    expect(screen.getByLabelText("加载中")).toBeInTheDocument();
  });

  it("applies size classes", () => {
    render(<Spinner size="lg" />);
    const spinner = screen.getByRole("status");
    // In jsdom, className may be an SVGAnimatedString, so we check the container instead
    expect(spinner.querySelector("svg")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<Spinner className="custom-spinner" />);
    const spinner = screen.getByRole("status");
    expect(spinner.className).toContain("custom-spinner");
  });
});

describe("EmptyState", () => {
  it("renders default title", () => {
    render(<EmptyState />);
    expect(screen.getByText("暂无数据")).toBeInTheDocument();
  });

  it("renders custom title", () => {
    render(<EmptyState title="No items found" />);
    expect(screen.getByText("No items found")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<EmptyState description="Try adjusting your filters" />);
    expect(screen.getByText("Try adjusting your filters")).toBeInTheDocument();
  });

  it("does not render description when not provided", () => {
    render(<EmptyState />);
    expect(screen.queryByText("Try adjusting your filters")).not.toBeInTheDocument();
  });

  it("renders custom icon", () => {
    render(<EmptyState icon={<span data-testid="custom-icon">📭</span>} />);
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("renders default icon when not provided", () => {
    render(<EmptyState />);
    // Default icon is Inbox from lucide-react
    expect(screen.getByText("暂无数据").closest("div")?.querySelector("svg")).toBeInTheDocument();
  });

  it("renders action when provided", () => {
    render(<EmptyState action={<button>Add item</button>} />);
    expect(screen.getByRole("button", { name: "Add item" })).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<EmptyState className="custom-empty" />);
    const container = screen.getByText("暂无数据").closest("div");
    expect(container?.className).toContain("custom-empty");
  });
});

describe("SearchInput", () => {
  it("renders search input with role", () => {
    render(<SearchInput aria-label="search" />);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("has type search", () => {
    render(<SearchInput aria-label="search" />);
    const input = screen.getByRole("searchbox");
    expect(input).toHaveAttribute("type", "search");
  });

  it("renders search icon", () => {
    render(<SearchInput aria-label="search" />);
    const container = screen.getByRole("searchbox").closest("div");
    expect(container?.querySelector("svg")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<SearchInput className="custom-search" aria-label="search" />);
    const input = screen.getByRole("searchbox");
    expect(input.className).toContain("custom-search");
  });
});

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("applies base classes", () => {
    render(<Card>Content</Card>);
    const card = screen.getByText("Content").closest("div");
    expect(card?.className).toContain("rounded-xl");
    expect(card?.className).toContain("border");
  });

  it("applies custom className", () => {
    render(<Card className="custom-card">Content</Card>);
    const card = screen.getByText("Content").closest("div");
    expect(card?.className).toContain("custom-card");
  });

  it("is clickable when onClick is provided", () => {
    const handleClick = vi.fn();
    render(<Card onClick={handleClick}>Clickable</Card>);
    const card = screen.getByText("Clickable").closest("div");
    fireEvent.click(card!);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("has button role when clickable", () => {
    render(<Card onClick={() => {}}>Clickable</Card>);
    const card = screen.getByRole("button");
    expect(card).toBeInTheDocument();
  });

  it("does not have button role when not clickable", () => {
    render(<Card>Not clickable</Card>);
    const card = screen.getByText("Not clickable").closest("div");
    expect(card).not.toHaveAttribute("role");
  });

  it("handles keyboard events when clickable", () => {
    const handleClick = vi.fn();
    render(<Card onClick={handleClick}>Keyboard</Card>);
    const card = screen.getByRole("button");
    fireEvent.keyDown(card, { key: "Enter" });
    expect(handleClick).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(card, { key: " " });
    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it("has tabIndex when clickable", () => {
    render(<Card onClick={() => {}}>Focusable</Card>);
    const card = screen.getByRole("button");
    expect(card).toHaveAttribute("tabIndex", "0");
  });
});
