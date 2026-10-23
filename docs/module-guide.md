# 模块导航

| 模块 | 用途 |
| --- | --- |
| [main](../src/main.mjs) / [entry](../src/entry.mjs) | 浏览器入口与组件装配 |
| [site](../src/site.mjs) | 原站页面解析与身份校验 |
| [requests](../src/requests.mjs) | 关系请求、重试与限流报告 |
| [scan](../src/scan.mjs) | 两跳关系扫描 |
| [issues](../src/issues.mjs) | 实时与缓存跳过记录的统一表达 |
| [candidates](../src/candidates.mjs) | 候选计数与排名 |
| [cache](../src/cache.mjs) | 共享协议适配与二度缓存结果重建 |
| [relationship-store](../vendor/bangumi-relationship-store/docs/module-guide.md) | 独立维护的关系快照协议与 IndexedDB 存储 |
| [view](../src/view.mjs) | 弹窗、任务状态与结果浏览 |
| [build](../scripts/build.mjs) / [release](../scripts/release.mjs) / [check](../scripts/check.mjs) | 产物构建与交付检查 |
