# 安全评审复核（commit e4206c5，复核人：security-reviewer agent_0ab7a2e9）
## 复核结论
passed
（无 Critical/High 安全问题；两项 Medium 均已按建议方向处置落地且消除偏差；三项 Low 修复到位；修复 diff 未引入新安全问题。验证：tests/notify/mail-integration + tests/server/favorite + favorite-route + content-delete-favorite + user-privacy → 5 文件 29 测试全绿。）
## 逐项结论
- Medium-2 favoriteCount 口径：消除，通过。Spec v5 Included 节两处改「后台只读展示（与互动计数现状对称，不提供修改/清零写入口）」，实现未补写接口（PUT schema 无 favoriteCount，编辑页只读），Spec 与代码一致，偏差关闭。
- Medium-1 来源页：消除，通过，无注入面。Referer→trim→空安全降级→≤300 截断→submitForm→renderFormSubmissionNotify；sourceUrl 仅进 highlight 文本经 escapeMultiline，非 href、无 scheme 执行上下文、不进 SMTP 头；测试口径与 AC-014 对齐（带/无 Referer 双分支路由级用例）。
- Low 三项：均已处置。TOCTOU/并发（deleteMany + count>0 递减 + deleteContent 级联 deleteMany，新用例锁定）；safeInternalPath 反斜杠归一化且返回归一化值（/\evil.example 绕过封死）；sendMail to 逐元素 headerSafe。残余：listMyFavorites 不过滤 status 的"下架瞬间已收藏"仅影响业主自视图，维持可接受。
- 模块拆分核为代码迁移：隐私白名单在 profile.ts 完整保留（4 字段仅 adminUpdateProfile 出口）、re-export 兼容、favorite route 仅剩 POST 且 401/404 语义逐字未变，无新增攻击面。
## 新发现（Info，非阻塞）
- form route body schema sourceUrl 死配置（后续已在 15710b7 清理）。
- Spec v5 G1_PENDING 待重批（流程项）。
- 原 Info 两条维持记录在案（absolutizeUrl data: 直通、llms.txt Markdown 未转义——均为受控输入）。
