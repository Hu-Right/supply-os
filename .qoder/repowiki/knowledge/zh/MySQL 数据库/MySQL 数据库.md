---
kind: external_dependency
name: MySQL 数据库
slug: mysql
category: external_dependency
category_hints:
    - vendor_identity
    - client_constraint
scope:
    - '**'
---

后端通过 `mysql2/promise` 连接 MySQL/MariaDB 数据库，默认连接 `localhost:3306/crm`（root/123456）。启动时自动执行 DDL 确保表结构存在，包括用户、订单、订阅、UNSPSC 编码等业务表。连接池大小限制为 10。