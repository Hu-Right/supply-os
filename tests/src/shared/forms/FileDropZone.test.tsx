/**
 * shared/forms/FileDropZone 组件测试
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileDropZone } from "@/shared/forms/FileDropZone";

describe("FileDropZone", () => {
  it("渲染默认 placeholder", () => {
    render(<FileDropZone />);
    expect(screen.getByText("拖拽文件到此处，或点击选择")).toBeInTheDocument();
  });

  it("自定义 placeholder", () => {
    render(<FileDropZone placeholder="上传文件" />);
    expect(screen.getByText("上传文件")).toBeInTheDocument();
  });

  it("role=button 可交互", () => {
    render(<FileDropZone />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("自定义 className 合并", () => {
    const { container } = render(<FileDropZone className="extra-drop" />);
    expect(container.firstElementChild!.className).toContain("extra-drop");
  });

  it("dragOver 切换为拖拽中样式", () => {
    const { container } = render(<FileDropZone />);
    const zone = container.firstElementChild!;
    fireEvent.dragOver(zone, { preventDefault: vi.fn() });
    expect(zone.className).toContain("border-teal-500");
  });

  it("dragLeave 恢复默认样式", () => {
    const { container } = render(<FileDropZone />);
    const zone = container.firstElementChild!;
    fireEvent.dragOver(zone, { preventDefault: vi.fn() });
    fireEvent.dragLeave(zone, { preventDefault: vi.fn() });
    expect(zone.className).toContain("border-slate-300");
  });

  it("drop 事件调用 onFilesChange", () => {
    const onFilesChange = vi.fn();
    const { container } = render(<FileDropZone onFilesChange={onFilesChange} />);
    const zone = container.firstElementChild!;

    const file = new File(["data"], "test.pdf", { type: "application/pdf" });
    fireEvent.drop(zone, {
      preventDefault: vi.fn(),
      dataTransfer: { files: [file] },
    });

    expect(onFilesChange).toHaveBeenCalledWith([file]);
  });

  it("drop 后拖拽状态重置", () => {
    const { container } = render(<FileDropZone />);
    const zone = container.firstElementChild!;
    fireEvent.dragOver(zone, { preventDefault: vi.fn() });
    expect(zone.className).toContain("border-teal-500");

    fireEvent.drop(zone, {
      preventDefault: vi.fn(),
      dataTransfer: { files: [] },
    });
    expect(zone.className).toContain("border-slate-300");
  });

  it("点击创建文件 input 并触发 onchange", () => {
    const onFilesChange = vi.fn();
    render(<FileDropZone onFilesChange={onFilesChange} />);

    // Mock createElement 以捕获动态创建的 input
    const mockInput = {
      type: "",
      accept: "",
      multiple: false,
      onchange: null as any,
      files: [new File(["data"], "doc.pdf", { type: "application/pdf" })],
      click: vi.fn(function (this: any) {
        // 模拟选择文件后触发 onchange
        this.onchange?.();
      }),
    };
    const createElementSpy = vi.spyOn(document, "createElement").mockReturnValue(mockInput as any);

    fireEvent.click(screen.getByRole("button"));

    expect(createElementSpy).toHaveBeenCalledWith("input");
    expect(mockInput.type).toBe("file");
    expect(onFilesChange).toHaveBeenCalled();

    createElementSpy.mockRestore();
  });

  it("accept 属性传递给动态 input", () => {
    render(<FileDropZone accept=".pdf,.doc" />);

    const mockInput: any = {
      type: "",
      accept: "",
      multiple: false,
      onchange: null,
      files: [],
      click: vi.fn(),
    };
    const spy = vi.spyOn(document, "createElement").mockReturnValue(mockInput);

    fireEvent.click(screen.getByRole("button"));

    expect(mockInput.accept).toBe(".pdf,.doc");
    spy.mockRestore();
  });

  it("multiple 属性传递给动态 input", () => {
    render(<FileDropZone multiple />);

    const mockInput: any = {
      type: "",
      accept: "",
      multiple: false,
      onchange: null,
      files: [],
      click: vi.fn(),
    };
    const spy = vi.spyOn(document, "createElement").mockReturnValue(mockInput);

    fireEvent.click(screen.getByRole("button"));

    expect(mockInput.multiple).toBe(true);
    spy.mockRestore();
  });

  it("displayName 为 FileDropZone", () => {
    expect(FileDropZone.displayName).toBe("FileDropZone");
  });
});
