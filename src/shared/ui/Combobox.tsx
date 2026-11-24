/**
 * 可搜索下拉组合框
 * Searchable Combobox (shadcn/ui pattern — Radix Popover + cmdk)
 *
 * @module shared/ui/Combobox
 * @description 可搜索的下拉选择器，用于替代 CountryFilter/AgencyFilter 中
 *              手写的搜索输入 + 下拉 + 失焦定时器 + 清除按钮结构。
 *              Radix Popover 提供无障碍性 + 定位；cmdk 提供搜索过滤。
 */

import { useState } from "react";
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
            "flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-secondary-200 bg-white px-3.5 text-sm text-secondary-900 shadow-xs",
            "transition-[border-color,box-shadow] hover:border-secondary-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15",
            "disabled:cursor-not-allowed disabled:bg-secondary-100 disabled:text-secondary-500 text-start",
          )}
        >
          <span dir="auto" className={cn("truncate", !selected && "text-secondary-400")}>
            {selected?.label ?? placeholder ?? ""}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {selected && (
              <X
                className="h-3.5 w-3.5 rounded text-secondary-400 hover:text-secondary-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                aria-label={clearLabel}
                role="button"
              />
            )}
            <ChevronsUpDown className="h-4 w-4 text-secondary-400 shrink-0" />
          </span>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            sideOffset={6}
            align="start"
            className={cn(
              "z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-xl shadow-secondary-950/10",
              "max-h-72",
            )}
          >
            <Command shouldFilter className="w-full">
              {searchPlaceholder !== undefined && (
                <div className="flex items-center gap-2 border-b border-secondary-100 px-3.5">
                  <Search className="h-4 w-4 shrink-0 text-secondary-400" />
                  <Command.Input
                    placeholder={searchPlaceholder}
                    className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-secondary-400"
                  />
                </div>
              )}
              <Command.List className="max-h-60 overflow-y-auto p-1.5">
                <Command.Empty className="py-5 text-center text-xs text-secondary-400">
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
                      "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm text-secondary-700 transition-colors",
                      "data-[selected=true]:bg-primary-50 data-[selected=true]:font-medium data-[selected=true]:text-primary-700",
                    )}
                  >
                    <span dir="auto" className="truncate">{item.label}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {item.hint && (
                        <span className="text-xs text-secondary-400 tabular-nums">{item.hint}</span>
                      )}
                      {item.value === value && <Check className="h-4 w-4 text-primary-600" />}
                    </span>
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
