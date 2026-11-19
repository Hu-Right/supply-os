/**
 * 供应商企业主页 feature 出口
 *
 * 页面主体为服务端组件（SupplierProfileHeader / SupplierProfileBody），客户端边界只有
 * SupplierProfileActions（发询盘 / 认领）。旧版 6-Tab 客户端页面已下线。
 */
export { SupplierProfileActions } from "./components/SupplierProfileActions";
export { SupplierProfileHeader } from "./components/SupplierProfileHeader";
export { SupplierProfileBody } from "./components/SupplierProfileBody";
export { SupplierClaimModal } from "./components/SupplierClaimModal";
