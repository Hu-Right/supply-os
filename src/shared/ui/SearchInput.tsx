/**
 * 搜索输入框组件
 * Search Input Component (shadcn/ui pattern)
 *
 * @module shared/ui/SearchInput
 * @description 带搜索图标的输入框，role="searchbox"。
 *              使用 cn() 合并类名。
 */

import { type InputHTMLAttributes, forwardRef } from "react";
import { Search } from "lucide-react";
import { cn } from "@/shared/utils";

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, ...props }, ref) => {
    const baseClasses =
      "w-full rounded-lg border border-secondary-300 bg-white py-2 ps-9 pe-3 text-sm text-secondary-900 placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20";

    return (
      <div className="relative">
        <Search
          className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400"
          aria-hidden="true"
        />
        <input
          ref={ref}
          type="search"
          role="searchbox"
          dir="auto"
          className={cn(baseClasses, className)}
          {...props}
        />
      </div>
    );
  },
);

SearchInput.displayName = "SearchInput";
