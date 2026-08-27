/**
 * 可搜索下拉组合框
 * Searchable Combobox (shadcn/ui pattern — Radix Popover + cmdk)
 *
 * @module shared/ui/Combobox
 * @description 可搜索的下拉选择器，用于替代 CountryFilter/AgencyFilter 中
 *              手写的搜索输入 + 下拉 + 失焦定时器 + 清除按钮结构。
 *              Radix Popover 提供无障碍性 + 定位；cmdk 提供搜索过滤。
 */

import { useState, type ReactNode } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/shared/utils";

export interface ComboboxItem {
  value: string;
  label: string;
  /** 下拉项右侧提示文案（如筛选计数），仅在下拉列表中展示 */
  hint?: string;
}

export interface ComboboxProps {
  items: ComboboxItem[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 搜索框占位符 */
  searchPlaceholder?: string;
  /** 清除按钮 aria-label */
  clearLabel?: string;
  /** 无匹配结果时的提示文案 */
  noResultsText?: string;
  className?: string;
  disabled?: boolean;
}

export function Combobox({
  items,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  clearLabel,
  noResultsText,
  className,
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.value === value);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <div className={cn("relative", className)}>
        <PopoverPrimitive.Trigger
          disabled={disabled}
          className={cn(
            "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900",
            "focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500",
            "disabled:bg-slate-100 disabled:text-slate-500 text-start flex items-center justify-between gap-2 cursor-pointer",
          )}
        >
          <span dir="auto" className={cn("truncate", !selected && "text-slate-400")}>
            {selected?.label ?? placeholder ?? ""}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {selected && (
              <X
                className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                aria-label={clearLabel}
                role="button"
              />
            )}
            <ChevronsUpDown className="h-4 w-4 text-slate-400 shrink-0" />
          </span>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            sideOffset={4}
            align="start"
            className={cn(
              "z-50 w-[var(--radix-popover-trigger-width)] rounded-lg border border-slate-200 bg-white shadow-lg",
              "max-h-72 overflow-hidden",
            )}
          >
            <Command shouldFilter={!searchPlaceholder ? true : true} className="w-full">
              {searchPlaceholder !== undefined && (
                <div className="flex items-center gap-2 border-b border-slate-100 px-3">
                  <Search className="h-4 w-4 shrink-0 text-slate-400" />
                  <Command.Input
                    placeholder={searchPlaceholder}
                    className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400"
                  />
                </div>
              )}
              <Command.List className="max-h-60 overflow-y-auto p-1">
                <Command.Empty className="py-4 text-center text-xs text-slate-400">
                  {noResultsText ?? "—"}
                </Command.Empty>
                {items.map((item) => (
                  <Command.Item
                    key={item.value}
                    value={`${item.value} ${item.label}`}
                    onSelect={() => {
                      onChange(item.value === value ? "" : item.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-sm text-slate-700",
                      "data-[selected=true]:bg-teal-50 data-[selected=true]:text-teal-700",
                    )}
                  >
                    <span dir="auto" className="truncate">{item.label}</span>
                    {item.hint && (
                      <span className="shrink-0 text-xs text-slate-400 tabular-nums">{item.hint}</span>
                    )}
                    {item.value === value && <Check className="h-4 w-4 shrink-0 text-teal-600" />}
                  </Command.Item>
                ))}
              </Command.List>
            </Command>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </div>
    </PopoverPrimitive.Root>
  );
}

Combobox.displayName = "Combobox";
