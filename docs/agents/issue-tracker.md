# Issue tracker: GitHub

本仓库的工单与待实施规格使用 GitHub Issues，通过 `gh` CLI 操作。
在仓库目录内执行命令，由 git remote 推断目标仓库。

## 常用操作

- 读取：`gh issue view <number> --json number,title,body,labels,comments`
- 列出：`gh issue list --state open --json number,title,body,labels`
- 创建：`gh issue create --title "..." --body-file <path>`
- 评论：`gh issue comment <number> --body-file <path>`
- 添加标签：`gh issue edit <number> --add-label "<label>"`
- 移除标签：`gh issue edit <number> --remove-label "<label>"`
- 关闭：`gh issue close <number> --comment "..."`

技能要求“发布到 issue tracker”时创建 GitHub Issue；
要求“获取相关 ticket”时读取对应 Issue。

## Pull requests as a triage surface

**PRs as a request surface: no.**

## 父子工单与依赖

优先使用 GitHub 原生 sub-issues 和 issue dependencies，通过 `gh api` 操作。
API 所需的数据库 ID 可通过以下命令获取：

`gh api repos/{owner}/{repo}/issues/<number> --jq .id`

- 添加子工单：向 `repos/{owner}/{repo}/issues/<parent>/sub_issues`
  发送 POST，请求字段为 `sub_issue_id=<child-db-id>`。
- 添加阻塞关系：向
  `repos/{owner}/{repo}/issues/<child>/dependencies/blocked_by`
  发送 POST，请求字段为 `issue_id=<blocker-db-id>`。

无法使用原生关系时，在子工单正文顶部标注 `Part of #<parent>`、
`Blocked by: #<number>`，并在父工单任务列表中链接子工单。
全部阻塞工单关闭后，子工单才可执行。

## Wayfinder

- Map：单个带 `wayfinder:map` 标签的 Issue，承载 Notes、
  Decisions-so-far 和 Fog。
- 子工单：关联 Map，使用 `wayfinder:<type>` 标签；
  type 为 research、prototype、grilling 或 task。
- Frontier：按 Map 顺序选择未关闭、无未关闭阻塞项且无人认领的子工单。
- 认领：`gh issue edit <number> --add-assignee @me`。
- 完成：评论结论、关闭子工单，再向 Map 的 Decisions-so-far 添加摘要和链接。
