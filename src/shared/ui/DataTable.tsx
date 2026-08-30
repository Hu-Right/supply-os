/**
 * 数据表格
 * Data Table (shadcn/ui pattern — @tanstack/react-table)
 *
 * @module shared/ui/DataTable
 * @description 基于 TanStack Table 的通用数据表格（headless），
 *              样式遵循项目 slate/teal 色板。支持列定义、排序状态透传。
 *              用法：消费方通过 columnHelper/table.createColumnDef 定义列，
 *              传入 data 即可渲染。
 */

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { cn } from "@/shared/utils";

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** 排序状态（受控） */
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  /** 空状态文案 */
  emptyText?: string;
  className?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  sorting,
  onSortingChange,
  emptyText,
  className,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: sorting ? { sorting } : undefined,
    onSortingChange: onSortingChange
      ? (updater) => {
          const next = typeof updater === "function" ? updater(sorting ?? []) : updater;
          onSortingChange(next);
        }
      : undefined,
  });

  return (
    <div className={cn("rounded-lg border border-secondary-200 overflow-x-auto", className)}>
      <table className="w-full text-xs">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-secondary-200 bg-secondary-50">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-3 py-2.5 text-start font-semibold text-secondary-700 whitespace-nowrap"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-secondary-100 last:border-0 hover:bg-secondary-50/50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2.5 text-secondary-600">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-secondary-400">
                {emptyText ?? "—"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

DataTable.displayName = "DataTable";
