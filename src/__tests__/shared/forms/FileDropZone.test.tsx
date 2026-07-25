import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileDropZone } from "@/shared/forms/FileDropZone";

describe("FileDropZone", () => {
  it("renders drop zone with placeholder text", () => {
    render(<FileDropZone placeholder="上传文件" />);
    expect(screen.getByText("上传文件")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByLabelText("文件上传区域")).toBeInTheDocument();
  });

  it("renders default placeholder when none provided", () => {
    render(<FileDropZone />);
    expect(screen.getByText("拖拽文件到此处，或点击选择")).toBeInTheDocument();
  });

  it("calls onFilesChange on drop event", () => {
    const onFilesChange = vi.fn();
    render(<FileDropZone onFilesChange={onFilesChange} />);

    const dropZone = screen.getByLabelText("文件上传区域");
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    expect(onFilesChange).toHaveBeenCalledWith([file]);
  });

  it("calls onFilesChange when file input changes (click flow)", () => {
    const onFilesChange = vi.fn();
    render(<FileDropZone onFilesChange={onFilesChange} accept=".pdf" />);

    // Mock document.createElement to capture the file input
    const mockInput = document.createElement("input");
    const createElementSpy = vi.spyOn(document, "createElement").mockReturnValue(mockInput);

    const dropZone = screen.getByLabelText("文件上传区域");
    fireEvent.click(dropZone);

    // Simulate file selection on the dynamically created input
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    Object.defineProperty(mockInput, "files", { value: [file], writable: false });
    fireEvent.change(mockInput);

    expect(onFilesChange).toHaveBeenCalledWith([file]);
    createElementSpy.mockRestore();
  });

  it("applies custom className", () => {
    render(<FileDropZone className="custom-class" />);
    const dropZone = screen.getByLabelText("文件上传区域");
    expect(dropZone.className).toContain("custom-class");
  });
});
