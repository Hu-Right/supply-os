/**
 * 供应商资源库常量
 * Supplier Pool Constants
 *
 * @module shared/constants/supplier-pool
 * @description 前后端共用的供应商资源库容量上限。服务层（lib/services/supplier-pool）
 *              与设置页展示均从此处取数，避免「服务端限 30、前端显示另一数字」漂移。
 *              独立成模块：服务层间接依赖 mysql2 repo，不能进客户端 bundle。
 */

/** 单个账号可绑定的供应商/合作工厂数量上限（防大型企业滥用无限堆积） */
export const SUPPLIER_POOL_MAX_SIZE = 30;
