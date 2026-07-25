import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button, Input, Select, Badge, Spinner, EmptyState, Card, SearchInput } from "@/shared/ui";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("handles click events", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByText("Click"));
    expect(onClick).toHaveBeenCalled();
  });

  it("is disabled when disabled prop is true", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is disabled when loading", () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("Input", () => {
  it("renders with placeholder", () => {
    render(<Input placeholder="Enter text" aria-label="test" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
  });

  it("handles value changes", () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} aria-label="test" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("applies error class when error=true", () => {
    const { container } = render(<Input error aria-label="test" />);
    const input = container.querySelector("input");
    expect(input?.className).toContain("border-rose-500");
  });
});

describe("Select", () => {
  it("renders options", () => {
    render(
      <Select aria-label="choice">
        <option value="a">Option A</option>
        <option value="b">Option B</option>
      </Select>,
    );
    expect(screen.getByText("Option A")).toBeInTheDocument();
    expect(screen.getByText("Option B")).toBeInTheDocument();
  });

  it("handles change events", () => {
    const onChange = vi.fn();
    render(
      <Select onChange={onChange} aria-label="choice">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
    expect(onChange).toHaveBeenCalled();
  });
});

describe("Badge", () => {
  it("renders children text", () => {
    render(<Badge>Status</Badge>);
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("has role=status when pulsate", () => {
    render(<Badge pulsate>Live</Badge>);
    expect(screen.getByRole("status")).toHaveTextContent("Live");
  });

  it("has no role when not pulsate", () => {
    const { container } = render(<Badge>Static</Badge>);
    expect(container.querySelector("[role='status']")).toBeNull();
  });
});

describe("Spinner", () => {
  it("has role=status", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has aria-label", () => {
    render(<Spinner />);
    expect(screen.getByLabelText("加载中")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("renders default title", () => {
    render(<EmptyState />);
    expect(screen.getByText("暂无数据")).toBeInTheDocument();
  });

  it("renders custom title and description", () => {
    render(<EmptyState title="No results" description="Try again" />);
    expect(screen.getByText("No results")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("renders action slot", () => {
    render(<EmptyState action={<button>Retry</button>} />);
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });
});

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("has role=button when onClick provided", () => {
    render(<Card onClick={() => {}}>Clickable</Card>);
    expect(screen.getByRole("button")).toHaveTextContent("Clickable");
  });

  it("calls onClick on Enter key", () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>Press</Card>);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(onClick).toHaveBeenCalled();
  });
});

describe("SearchInput", () => {
  it("has role=searchbox", () => {
    render(<SearchInput aria-label="search" />);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("handles input changes", () => {
    const onChange = vi.fn();
    render(<SearchInput onChange={onChange} placeholder="Search..." />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "test" } });
    expect(onChange).toHaveBeenCalled();
  });
});
