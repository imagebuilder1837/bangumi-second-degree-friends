# Domain docs

本仓库采用 single-context：根目录 `GLOSSARY.md` 和 `docs/adr/`。

## 探索前读取

- 读取 `GLOSSARY.md`。
- 读取 `docs/adr/` 中与当前工作相关的 ADR。

文件不存在时静默继续，不预先要求创建。
由 domain-modeling 技能在术语或决策明确后按需创建。

## 使用术语

Issue 标题、重构建议、假设、测试名等涉及领域概念时，
使用术语表定义的名称，避免使用其明确排除的同义词。

缺少必要术语时，先检查是否引入了项目不用的概念；
确有缺口则交由 domain-modeling 处理。

## ADR 冲突

建议与现有 ADR 冲突时，明确指出对应 ADR 及重新讨论的理由，
不静默覆盖已有决策。
