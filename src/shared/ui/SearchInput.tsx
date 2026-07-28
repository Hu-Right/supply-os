/**
 * 搜索输入框组件
 * Search Input Component
 *
 * @module shared/ui/SearchInput
 * @description 带搜索图标的输入框，role="searchbox"
 *              Input with search icon, role="searchbox"
 */

import { type InputHTMLAttributes, forwardRef } from "react";
import { Search } from "lucide-react";

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className = "", ...props }, ref) => {
    const baseClasses =
      "w-full rounded-lg border border-slate-300 bg-white py-2 ps-9 pe-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";

    return (
      <div className="relative">
        <Search
          className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          ref={ref}
          type="search"
          role="searchbox"
          dir="auto"
          className={`${baseClasses} ${className}`}
          {...props}
        />
      </div>
    );
  },
);

SearchInput.displayName = "SearchInput";
