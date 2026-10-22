# Bangumi 原站调查

## 证据边界

- **实测（响应正文）**：本次通过匿名 HTTP 抓取工具读取原站 HTML、CSS、JavaScript；页面版本标记为 `r771`。未运行浏览器脚本，以下“结构”指服务器返回的 HTML，不是浏览器运行后的 DOM 或视觉验收。
- **官方文档／源码**：站方 Sai 发布的指南、原站实际分发的静态资源、Bangumi 官方 API schema；HTTP / Fetch 规则另引标准。
- **推断**：只在明确标注处使用；**未验证**不等于不存在。
- 抓取工具未展示状态码、响应头、最终 URL 或重定向链；不能从成功取得正文推定 HTTP 200，也不能从错误图片名称推定 404。本次未使用浏览器登录态核验，没有登录、提交表单、修改站点状态或主动触发限流；没有遍历用户关系图。

## 1. 超合金组件的执行与发布

### 官方说明

[开发者平台](https://bgm.tv/dev)与[组件目录](https://bgm.tv/dev/garage)将组件定义为站内 JavaScript / CSS 功能增强脚本或样式。

站方 [2018 年发布说明](https://bgm.tv/group/topic/345157)给出流程：在 `/dev/app` 新建类型为“组件”的应用 → “添加新版本”填写 JavaScript 和 CSS → 保存后在 `/settings/gadgets` 启用 → 可提交审核供其他用户使用。此为历史官方指南，**本次未登录核验当前编辑表单、审核流程及耗时**；不能把最初内测“仅创建者可用”当成当前全部组件的状态。[站方开发指南目录](https://bgm.tv/index/81881)仍收录该文及作用域、个性化面板、云端设置指南。

[作用域指南](https://bgm.tv/group/topic/345291)明确支持 userscript metadata 的 `@include`、`@exclude`、`@match`，其中 exclude 优先；提供 `log.setLevel('debug')` 查看执行及解析信息。这不表示所有脚本管理器指令都实现。

### 当前分发源码实测

来源：[原站 JavaScript `/min/g=js?r771`](https://bgm.tv/min/g=js?r771)，定位 `chiiLib.widget.loader`、`userscriptParser`：

- loader 接收 `plugins, styles, settings`；逐个调用脚本加载函数与样式加载函数，未见串行等待所有脚本的逻辑。
- 脚本通过 `$.ajax` 以文本读取；解析 metadata，再按 `window.location.href` 检查 include / match / exclude 和组件暂停状态。
- 满足作用域后，将响应正文包进 `(function(CHII_APP_ID){ ... })(...)`，其中注入 `chiiApp.cloud_settings`，然后 `eval(js)` 执行。样式另建 `<link rel="stylesheet">` 插入到首个 script 前。
- metadata 解析器收集 `@键 值`；**在所读 loader 中未见 `run-at` 调度或 GM 特权 API 的实现**。不能将 userscript 管理器中的 `@run-at document-end`、`@grant none` 当成原站加载时序／沙箱契约；本次未运行组件验证调用时点。
- 源码的 `canExcute`：有 include / exclude / match 数组时，include 或 match 命中才放行，exclude 命中否决；无这些数组则返回 true。
- **源码解释**：`https://bgm.tv/user/*` 的通配符不限于一个路径段，不能仅凭此 metadata 把 `/user/sai/friends` 等子页面排除。原站主页样本为 `/user/sai`、`/user/1`，用户关系样本为 `/user/sai/friends`、`/user/sai/rev_friends`；其他尾斜杠／查询参数组合未浏览器实测。

## 2. 用户主页与药丸、主题

来源：[bgm.tv 的 Sai 主页](https://bgm.tv/user/sai)、[bangumi.tv 同用户主页](https://bangumi.tv/user/sai)、[当前样式表](https://bgm.tv/css/dist/bangumi.min.css?r771)。

**实测 HTML**：`#user_home .user_box ul.network_service.clearit` 确为 `ul`，直接子项为 `li`，不是 div 列表。缩略原文：

```html
<ul class="network_service clearit">
  <li><span class="service" style="background-color:#F09199;">Bangumi</span>
      <span class="tip">2008-6-19 加入</span></li>
  <li><span class="service" style="background-color: #004AB0">PSN</span>
      <span class="tip"><a href="https://www.playstation.com/en-us/my/public-trophies/?onlineId=Saiccc"
      class="l" rel="nofollow external noopener noreferrer" target="_blank">Saiccc</a></span></li>
</ul>
```

这是一个用户配置了网络服务的样本，**不证明每个主页都有此容器或相同服务项**。药丸本身是 `span.service`，链接在后面的 `span.tip > a.l`，并不是“药丸必定是 a”。

**CSS 直接证据**（省略厂商前缀）：

```css
.network_service { margin:5px 0 }
.network_service li { float:left; margin:5px }
.network_service li span.service {
  font-size:11px; padding:2px 10px; background:#eee;
  color:#fff; border-radius:100px;
}
```

- HTML 根节点实测为 `data-theme="light" data-theme-color="pink"`。CSS 用 `html[data-theme=dark]` 覆盖深色主题，不是仅以系统媒体查询为主题依据。
- 原站 `.tip` 浅色 `#666`，深色 `#d8d8d8`；`a.l` 浅色 `#0084b4`，深色 `#2ea6ff`，hover `#02a3fb`。
- `.user_box` 浅色文字 `#333`，深色 `#e9e9e9`；所见 `.network_service ... span.service` 规则没有紧邻的独立深色覆盖，各服务还可有内联背景色。
- 另有通用圆角链接 `a.chiiBtn`：inline-block、12px、line-height 20px、padding `2px 12px`、radius 20px；浅色文字 `#666` / 边框 `#ddd`，深色文字 `#d8d8d8` / 边框 `#6e6e6e` 并更换渐变与阴影。**仅证明 CSS 存在**，匿名 Sai 主页未发现该类，不能把它当成 network_service 现有 HTML。
- 深浅主题以上为样式源码证据，未进行切换主题、computed style、移动布局或截图实测。

## 3. 关系方向、列表结构与分页

### 方向的原站文字证据

[主页](https://bgm.tv/user/sai)侧栏 `#friend` 的标题为“Sai🖖的朋友”，more 指向 `/user/sai/friends`；同区底部链接原文为：

```html
<a href="/user/sai/rev_friends">+ 谁加Sai🖖为好友</a>
```

据此，`friends` 是该用户添加的朋友（出向关系），`rev_friends` 是把该用户加为好友的人（入向关系）；并不要求互相添加。**支持：原站文字与链接的直接证据／方向解释；未进行增删好友操作验证。**

### 两类列表共用结构

匿名样本：[Sai 的 friends](https://bgm.tv/user/sai/friends)、[Sai 的 rev_friends](https://bgm.tv/user/sai/rev_friends)、[用户 2 的 friends](https://bgm.tv/user/2/friends)。结构相同：

```html
<div id="columnUserSingle" class="column">
  <div><ul id="memberUserList" class="usersMedium">
    <li class="user" style="width:24%">
      <div class="userContainer"><strong>
        <a href="/user/e6nian" class="avatar">
          <span class="userImage"><span class="avatarNeue avatarSize48 ll"
            style="background-image:url('//lain.bgm.tv/pic/user/l/000/00/00/5.jpg')"></span></span>
          如果思念是一碗汤圆
        </a>
      </strong></div>
    </li>
  </ul></div>
</div>
```

| 信息 | 样本中的定位／含义 |
| --- | --- |
| 列表 | `#memberUserList.usersMedium` |
| 用户条目 | `#memberUserList > li.user`；部分另有 `odd` 类 |
| 用户链接 | `.userContainer > strong > a.avatar`，href 为 `/user/{路径身份}` |
| 显示名 | 该 a 的文本（含空白与内层 span，需区分头像节点）；可能含 emoji／省略号，不能用作唯一身份 |
| 头像 | `.userImage > span.avatarNeue` 的内联 `background-image`；此列表样本不是 img |

### 分页：没有观察到分页结构

- 上述三个样本的完整响应正文中，未找到 `page`、`?page=`、`page_inner`、`paginator` 或 `multipage`。列表以 `</li></ul>` 闭合后即结束主体并进入 footer；Sai 的 rev_friends 响应约 86.9 万字符，仍未见分页控件。
- 只额外读取一次 [`/user/sai/friends?page=2`](https://bgm.tv/user/sai/friends?page=2)：正文长度与无查询参数样本同为 133877 字符，已核对的开头／用户条目片段相同；**没有“第二页已前进”的证据**，也未做全量字节比较。
- **结论限于样本**：不能声称这些页面存在固定每页条数、下一页选择器或末页页码。样本呈现单次输出列表的结构，但“全站永不分页／未截断”未验证；不能把任意加 `page=N` 后仍返回条目当作还有下一页，也不能把缺少列表当作末页。

## 4. 路径身份、数字 ID 与用户名

- **实测**：同一列表混有 `/user/2`、`/user/237` 和 `/user/e6nian`、`/user/asher`。显示名与路径不同，例如 `/user/asher` 的显示名为“白菜”。
- **官方 schema**：[Bangumi API `v0.yaml`](https://github.com/bangumi/api/blob/master/open-api/v0.yaml) 的 User 区分 integer `id`、string `username`、string `nickname`；`username` 注释为“唯一用户名，初始与 UID 相同，可修改一次”。API 的 `path_username` 明写“设置了用户名之后无法使用 UID”。这条限制是 **API 文档**，不是所有网页路由的保证。数字与非数字路径混用本身也不能证明列表未规范化，因为未改名用户的 username 本就可以是数字。
- **主页身份实测**：[`/user/1`](https://bgm.tv/user/1) 与 [`/user/sai`](https://bgm.tv/user/sai) 的标题均含 `<div class="name"><a href="/user/sai">Sai🖖</a><small class="grey">@sai</small>`。主页身份链接可定位为 `#headerProfile h1.nameSingle .inner > .name > a[href]`；明示用户名为同级 `small.grey` 文本。两份响应未找到 canonical；`CHOBITS_UID`、`CHOBITS_USERNAME` 表示当前访问者，不能作为主页用户身份。
- **主页关系链接实测**：两份主页均明确提供 `/user/sai/friends` 与 `/user/sai/rev_friends`，分别可定位为 `#headerProfile .navTabs a[href$="/friends"]` 和 `#friend a[href$="/rev_friends"]`。**推断**：消费主页已给出的路径可避免猜测数字子路由；这不解释数字子路由的服务器机制，也不保证所有列表条目始终使用当前路径身份。
- **实测反例／待解释**：[`/user/1`](https://bgm.tv/user/1)返回含 `@sai` 的主页，但 [`/user/1/rev_friends`](https://bgm.tv/user/1/rev_friends)本次返回 133877 字符，已查看的开头条目与 Sai 的 friends 一致；`/user/sai/rev_friends` 则为 869210 字符，早期条目也有差别。**不能推定数字 ID 与自定义用户名的子路由等价。** 工具不提供重定向链，未能确认是重定向、路由行为还是抓取链路差异；不据此断言服务器重定向目标。
- **推断**：跨响应合并身份时，原始 href 字符串、显示名、头像文件名均不足以证明是永久稳定 ID。头像样本有默认 `icon.jpg`、数字文件名和带随机后缀／查询参数的文件名，不是可靠的身份映射契约。数字 ID 的长期不可变性未找到明确官方网页契约。

## 5. 匿名、空列表与错误响应

- **匿名可读样本**：上述主页、friends、rev_friends 正文有 `CHOBITS_UID = 0`、`CHOBITS_USERNAME = ''` 及登录／注册链接；仍返回用户条目。不能因此推定每个用户、所有隐私／屏蔽状态都匿名可读。[原站 JS](https://bgm.tv/min/g=js?r771) 的 `initSortBy` 仅在 `CHOBITS_UID > 0` 时提供“自己”过滤，`updateFilterBy('self')` 按 `CHOBITS_USERNAME` 匹配回复作者，直接支持这两个变量表示当前访问者；真实登录态的变量赋值未实测。
- **真实空 friends 样本**：[`/user/8/friends`](https://bgm.tv/user/8/friends)（堂堂）与 [`/user/237/friends`](https://bgm.tv/user/237/friends)（水银控）均有匹配目标用户的 `#headerProfile` 身份头，主体为下述明确空列表，没有另附“暂无好友”文本。两人的 rev_friends 页面均有实际用户条目。匹配身份头加明确空 ul 是样本内的零好友证据；缺少 ul 或零条目本身不是。

```html
<div class="columns clearit">
  <div id="columnUserSingle" class="column">
    <div><ul id="memberUserList" class="usersMedium"></ul></div>
  </div>
</div>
```

- **不存在用户样本**：[`/user/__external_research_nonexistent__/friends`](https://bgm.tv/user/__external_research_nonexistent__/friends)返回原站完整外壳，主体为 `#colunmNotice`（原站拼写如此），含 `h2`“呜咕，出错了”、`p.text`“数据库中没有查询到该用户的信息”和 `/img/bangumi/404.png`；不是 `#memberUserList`。**HTTP 状态未知**，图片叫 404 不等于响应状态 404。
- **浏览器登录态补充实测**：`shironegi` 的好友中，`616197`、`1041797`、`1208024`、`1097234`、`1189298`、`1260050` 的主页身份匹配、显示名为 `[已注销]`，但 friends 返回 HTTP 200、最终 URL 不变，正文仅含 `#colunmNotice` 错误主体：`h2` 为“呜咕，出错了”、`p.text` 为“啊噢，你访问的页面似乎被 Bangumi 娘吃掉了。”、图片为 `/img/bangumi/404.png`，无身份头和列表；不使用缓存重新请求仍如此。`616197/rev_friends` 同样返回该错误页。错误页不能证明零关系或具体账号状态。
- **反例**：同样显示名为 `[已注销]` 的 `yuri_chan` 的 friends 返回合法空列表，rev_friends 返回 167 条关系；`aguamalas`、`763761`、`e911` 的 friends 也可正常解析。不能仅凭显示名推断列表不可访问。
- **未验证**：账号真实注销／封禁状态、权限拒绝页面、会话过期、HTTP 401/403/404/5xx 与正文的对应关系。空 friends 样本不等于已核验空 rev_friends 模板。

## 6. 三域名、凭据与资源地址

- **实测**：[bgm.tv](https://bgm.tv/user/sai) 与 [bangumi.tv](https://bangumi.tv/user/sai) 均返回主页 HTML，各自 `SITE_URL` 为当前请求域对应的 HTTPS 地址；两者有同样 network_service 片段。未取得 HTTP 重定向头，不能宣称所有路径永不跨主机跳转。
- **实测障碍**：[chii.in 同一路径](https://chii.in/user/sai)返回标题 `Just a moment...`、`Enable JavaScript and cookies to continue`、`/cdn-cgi/challenge-platform/...` 的 Cloudflare 验证正文，未取得用户 DOM。此证据不是 429 的证明，也不代表正常浏览器一定无法访问。
- **标准**：[Fetch Standard：credentials mode](https://fetch.spec.whatwg.org/#concept-request-credentials-mode)默认 `same-origin`，只对同源请求带凭据；[redirect mode](https://fetch.spec.whatwg.org/#concept-request-redirect-mode)默认 `follow`。三个不同主机不是同一 origin；增加 `credentials: 'include'` 不等于自动获得另一域的登录态或绕过 CORS。
- **实测**：用户链接多为根相对地址 `/user/...`；头像为协议相对 CDN `//lain.bgm.tv/pic/user/...`。同一[好友列表](https://bgm.tv/user/sai/friends)中，`/user/2` 的头像为 `//lain.bgm.tv/pic/user/l/000/00/00/2.jpg?r=1322480632`，`/user/8`、`/user/237` 使用 `//lain.bgm.tv/pic/user/l/icon.jpg`，`/user/mizudiwood` 使用 `//lain.bgm.tv/pic/user/l/000/02/18/21804_2Oro7.jpg?r=1757342413&hd=1`。**推断**：账号路径无法提供自定义文件名后缀、默认图选择和版本参数；未发现仅凭数字 ID 可靠构造当前完整 CDN 地址的官方契约。**标准解释**：以 HTTPS 页面 URL 为基准解析，头像得到 HTTPS 的 CDN URL；CDN 并非页面同源。
- **官方头像接口**：[API schema](https://github.com/bangumi/api/blob/master/open-api/v0.yaml)另提供 `avatar.large/medium/small` 地址字段，以及 `/v0/users/{username}/avatar` 头像重定向端点。按用户名构造该接口地址与推导 CDN 文件名是两回事，前者仍需请求官方 API；本次未验证浏览器实际加载该接口。
- **未验证**：三域的 cookie Domain / SameSite / Secure 属性、会话是否同步、跨域 HTML fetch 的 CORS 响应头、真实浏览器登录态 fetch、跨域重定向后的可读性。上述标准规则不是对原站实际 cookie 配置的测量。

## 7. 限流与 HTTP 标准

- **原站未确认**：没有找到明确适用于网页 friends / rev_friends 的公开频率／并发额度、窗口算法、封禁时长、429 正文或 `Retry-After` 返回保证。本次没有主动触发限流；Cloudflare 挑战与应用层限流不能混为一谈。API 限流即使另有说明，也不能直接套到网页端点。
- **HTTP 标准直接证据**：[RFC 6585 §4](https://www.rfc-editor.org/rfc/rfc6585.html#section-4)将 429 定义为一定时间内请求过多；响应 **MAY** 带 `Retry-After`，不是必须带。§7.2 同时说明服务器限制资源时不必须使用 429，可以丢弃连接或采用其他措施。
- **HTTP 标准直接证据**：[RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3)规定 `Retry-After = HTTP-date / delay-seconds`；后者是非负十进制整数，单位秒。标准不说明 Bangumi 是否返回它，也不提供原站限额。

## 8. 浏览器本地存储与写入协调

以下为 IndexedDB 标准与浏览器厂商资料，不是 Bangumi 服务器行为；未进行真实浏览器、多标签页、容量或断电恢复实测。

- **标准：事务原子性**：[W3C IndexedDB §2.7.1](https://www.w3.org/TR/IndexedDB/#transaction-lifecycle)规定提交时全部更改原子写入，发生磁盘写入等错误则不写入任何更改；[中止算法 §5.5](https://www.w3.org/TR/IndexedDB/#abort-transaction)撤销该事务对数据库的全部更改。单个请求成功不等于事务提交成功；事务成功提交后才触发 `complete`。
- **标准：并发与排队**：同一数据库可由多个页面／worker 同时使用（[W3C IndexedDB 示例说明](https://www.w3.org/TR/IndexedDB/#handling-versionchange)）；[§2.7.2](https://www.w3.org/TR/IndexedDB/#transaction-scheduling)要求 `readwrite` 事务等待更早创建、作用域重叠且未结束的事务。作用域按 object store 判断，不按记录 key；重叠的只读事务可以并行。此为数据库事务调度保证，不是任意异步读写流程的全局锁。
- **标准及解释：隔离范围**：[W3C IndexedDB §2.1](https://www.w3.org/TR/IndexedDB/#database-construct)以 storage key 划分数据库集合，数据库名只在该 key 内标识数据库；[Storage Standard §4.2](https://storage.spec.whatwg.org/#storage-keys)以 origin 定义 key，并注明存储分区模型可能扩展。因此同名数据库不跨不同主机共享，也不能据同源推定不同浏览器配置或隔离分区必然共享；禁用存储时获取 key 可失败。
- **标准／厂商资料：容量与保留边界**：[Storage Standard §6–7](https://storage.spec.whatwg.org/#usage-and-quota)将用量与配额定义为实现相关估计，存储压力下可清理默认的 `best-effort` 存储；[WebKit 存储政策](https://webkit.org/blog/14403/updates-to-storage-policy/)确认 IndexedDB 受配额与清理政策约束，配额上限不保证可实际写满，写入可能报 `QuotaExceededError`。获准的 `persistent` 模式限制浏览器自动清理，不阻止用户清除；[IndexedDB durability hint](https://www.w3.org/TR/IndexedDB/#transaction-durability-hint)还区分默认、宽松与严格落盘语义。因此事务完成不承诺固定容量、永久保留或断电后必定恢复。
- **标准：版本升级阻塞**：[W3C IndexedDB 打开连接算法 §5.1](https://www.w3.org/TR/IndexedDB/#open-a-database-connection)要求升级前通知旧连接 `versionchange`，等待这些连接关闭；通知后仍有未关闭连接时触发 `blocked`。此事件表示升级等待其他连接，不是一般写事务的排队通知。
