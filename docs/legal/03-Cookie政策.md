# Cookie 政策 · Cookie Policy

> **用途**：后台「协议管理 → COOKIES」的中英文正文（富文本）。
> **待你补充**（`【】`）：运营者全称、联系邮箱、联系电话、联系地址、生效日期。
> **本政策已按系统实际行为核对**（Cookie 名称、保存期限、是否受同意开关约束都来自代码实测，不是套模板）：
> - 前台用户会话 `aition_user`：HttpOnly、SameSite=Lax、HTTPS 下 Secure、最长 **30 天**（站上旧版政策写的是"7 天"，与代码不符，本次已改正）
> - 本地存储三项：`aition_vid`（匿名访客标识）、`aition_cookie_consent`（同意偏好）；后台另有列表视图偏好，仅管理员可见
> - **需你决定的一点**：同意条幅的"仅必要"选项目前**实际上不影响匿名统计**——埋点（`page-tracker.tsx`）在写入 `aition_vid` 前并未读取同意状态。因此本政策如实写成"本站当前未部署任何非必要类技术，两个选项实际效果相同"。如果你希望这个选项有实质作用，需要一处约半小时的小改动（让埋点先读同意状态），改完政策里可以承诺"选择仅必要则不写入统计标识"。**建议改**——否则条幅形同虚设。

---

## Cookie 政策（中文版）

**版本 v1.0｜生效日期：【生效日期】｜最近更新：【更新日期】**

【运营者全称】（以下简称"我们"）运营的网站 aition.xin 及其子域（以下简称"本站"）使用 Cookie 与本地存储（Local Storage）来保障站点正常运行、维持登录状态、记录您的偏好并完成基础访问统计。本政策说明我们使用哪些技术、各自的用途与保存期限，以及您如何管理。关于我们如何处理您的个人信息，请同时参阅《用户隐私政策》。

### 一、什么是 Cookie 与本地存储

1.1 Cookie 是网站写入您设备浏览器中的小文本文件，通常用于记住登录状态与偏好设置；本地存储（Local Storage）是浏览器提供的本地存储空间，作用类似，数据同样保存在您自己的设备上，不会随每次请求自动发送。

1.2 本站**不使用 Cookie 或本地存储进行广告投放、跨站追踪或用户画像**，也不接入任何第三方广告或分析脚本。

### 二、我们使用的 Cookie 与本地存储

**（一）Cookie**

| 名称 | 类型 | 用途 | 保存期限与属性 |
| --- | --- | --- | --- |
| `aition_user` | 严格必要 | 维持注册用户与投稿用户的登录状态，有效期内免重复登录 | 最长 30 天；HttpOnly、SameSite=Lax，HTTPS 访问下启用 Secure；仅在您登录或注册时写入 |
| `aition_admin` | 严格必要 | 维持后台管理员的登录状态（仅后台使用，普通访客不会写入） | 同上；仅在后台登录时写入 |
| `aition_guest` | 严格必要 | 游客身份标识，用于点赞等轻度互动的防刷与去重 | 随会话/短期有效 |

**（二）本地存储（Local Storage）**

| 名称 | 类型 | 用途 | 保存期限 |
| --- | --- | --- | --- |
| `aition_vid` | 基础统计（匿名） | 由浏览器随机生成的一个匿名访客标识，用于区分独立访客、统计页面访问量（PV／UV） | 持久保存在您的浏览器中，直至您清除站点数据 |
| `aition_cookie_consent` | 功能偏好 | 记录您在本站 Cookie 提示条幅中的选择，避免每次访问重复弹出 | 持久保存在您的浏览器中，直至您清除站点数据 |

**（三）说明**

- 除上表所列外，本站**不写入任何第三方 Cookie**。
- 我们的**服务器端安全日志**（IP 地址、User-Agent、访问时间等）不属于 Cookie 或本地存储，其处理规则见《用户隐私政策》第二条与第六条。
- 浏览次数统计与"独立访客"统计均由上述匿名标识与服务端聚合完成，**不与您的账号、邮箱、昵称等身份信息关联**，我们无法通过该标识识别出具体是谁。

### 三、关于同意

3.1 您首次访问本站时，页面底部会显示 Cookie 提示条幅，您可以选择"全部接受"或"仅必要"，您的选择会记录在本地存储 `aition_cookie_consent` 中。

3.2 我们按以下分类管理：

- **严格必要类**：登录会话、安全防护等。此类技术是站点正常提供服务的必要条件，无法关闭；关闭后将无法登录或使用互动功能。
- **功能偏好类**：记住您的同意选择。
- **基础统计类**：仅使用匿名访客标识进行页面访问量统计，不用于识别个人身份、不用于广告或跨站追踪。
- **非必要类（分析、广告、第三方媒体）**：**本站当前未部署任何此类技术。**

3.3 因此，**在本站当前的功能范围内，"全部接受"与"仅必要"两个选项的实际效果相同**；我们保留该选项，是为了在将来引入非必要类技术时能够尊重您的选择——届时我们会更新本政策并重新征得您的同意。

### 四、第三方与外部链接

4.1 **微信扫码登录**：当您选择微信扫码登录时，页面会跳转至腾讯微信的授权页面，该页面可能由腾讯设置其自身的 Cookie，相关处理适用腾讯微信的隐私政策；我们仅接收校验结果与必要标识，不获取也不保存您的微信密码。

4.2 **邮件送达**：我们通过网易 163 邮箱 SMTP 服务向您发送找回密码、咨询提醒等邮件，该环节不涉及在本站写入 Cookie。

4.3 本站的访问统计完全自建自用，**未接入 Google Analytics、百度统计、友盟等第三方统计服务**。

### 五、如何管理

5.1 您可以在浏览器设置中查看、删除 Cookie，或清除本站的站点数据（含本地存储）。主流浏览器的设置路径通常为"设置 → 隐私与安全 → Cookie 及其他站点数据"。

5.2 清除或拒绝后的影响：

- 清除 `aition_user` / `aition_admin`：需要重新登录；
- 清除 `aition_cookie_consent`：下次访问会再次看到 Cookie 提示条幅；
- 清除 `aition_vid`：您的下一次访问将被作为新访客重新计入统计，这不影响您浏览任何内容；
- 拒绝严格必要类 Cookie：不影响您浏览本站公开内容，但登录、评论、投稿、表单提交等功能将无法正常使用。

5.3 使用浏览器隐私模式（无痕模式）访问时，上述本地存储与 Cookie 通常会在会话结束后被清除。

### 六、政策更新与联系我们

6.1 本政策可能随功能调整或法律法规变化更新，更新后的版本将在本页公布并自公布之日起生效。

6.2 如您对本政策有任何疑问、意见或建议，请通过以下方式联系我们：

- 联系邮箱：【联系邮箱】
- 联系电话：【联系电话】
- 联系地址：【联系地址】

---

## Cookie Policy (English Version)

> **Note**: This English version is provided for readers who do not use Chinese. If there is any discrepancy, **the Chinese version shall prevail.**

**Version 1.0 | Effective: 【Effective Date】 | Last updated: 【Updated Date】**

aition.xin and its subdomains (the "Site"), operated by 【Legal entity / operator name】 ("we", "us"), use cookies and local storage to keep the Site running, maintain login state, remember your preferences and produce basic visit statistics. This Policy explains which technologies we use, why, for how long, and how you can manage them. For how we handle personal information, please also see our Privacy Policy.

### 1. What Are Cookies and Local Storage

1.1 Cookies are small text files written to your browser, typically used to remember login state and preferences. Local storage is browser-provided storage with a similar role; the data stays on your own device and is not sent with every request.

1.2 The Site **does not use cookies or local storage for advertising, cross-site tracking or user profiling**, and does not load any third-party advertising or analytics scripts.

### 2. What We Use

**(a) Cookies**

| Name | Category | Purpose | Retention and attributes |
| --- | --- | --- | --- |
| `aition_user` | Strictly necessary | Maintains the login state of registered users | Up to 30 days; HttpOnly, SameSite=Lax, Secure over HTTPS; set only when you log in or register |
| `aition_admin` | Strictly necessary | Maintains the administrator's console session (console only — never set for ordinary visitors) | As above; set only on console login |
| `aition_guest` | Strictly necessary | Guest identifier used to de-duplicate and prevent abuse of lightweight interactions such as likes | Session / short-lived |

**(b) Local storage**

| Name | Category | Purpose | Retention |
| --- | --- | --- | --- |
| `aition_vid` | Basic statistics (anonymous) | A random anonymous visitor identifier used to distinguish unique visitors and count page views (PV/UV) | Persists in your browser until you clear site data |
| `aition_cookie_consent` | Functional preference | Records the choice you made in our cookie banner so it does not reappear on every visit | Persists in your browser until you clear site data |

**(c) Notes**

- Apart from the items above, the Site **sets no third-party cookies**.
- Our **server-side security logs** (IP address, user agent, access time) are not cookies or local storage; their handling is described in Sections 2 and 6 of the Privacy Policy.
- Page-view and unique-visitor statistics are produced from the anonymous identifier and server-side aggregation. They are **not linked to your account, email or nickname**, and we cannot identify you from that identifier.

### 3. About Consent

3.1 On your first visit, a cookie banner appears at the bottom of the page where you may choose "Accept all" or "Necessary only". Your choice is stored in the local storage item `aition_cookie_consent`.

3.2 We group technologies as follows:

- **Strictly necessary**: login sessions and security protections. These are required for the Site to function and cannot be disabled; disabling them prevents login and interactive features.
- **Functional preference**: remembering your consent choice.
- **Basic statistics**: page-view measurement using an anonymous visitor identifier only — not for identifying individuals, advertising or cross-site tracking.
- **Non-essential (analytics, advertising, third-party media)**: **the Site currently deploys none.**

3.3 Consequently, **within the Site's current functionality, "Accept all" and "Necessary only" have the same practical effect.** We keep the option so that we can honour your choice if we introduce non-essential technologies in future — at which point we will update this Policy and seek your consent again.

### 4. Third Parties and External Links

4.1 **WeChat QR sign-in**: if you choose WeChat sign-in, you are redirected to Tencent WeChat's authorisation page, which may set its own cookies under Tencent WeChat's privacy policy. We receive only the verification result and necessary identifiers, and never obtain or store your WeChat password.

4.2 **Email delivery**: we send password reset and notification emails through NetEase 163 SMTP; this does not involve setting cookies on the Site.

4.3 Visit statistics are entirely self-developed and self-hosted. **We do not use Google Analytics, Baidu Analytics, Umeng or any other third-party analytics service.**

### 5. How to Manage

5.1 You can view or delete cookies and clear site data (including local storage) in your browser settings, typically under "Settings → Privacy and security → Cookies and other site data".

5.2 Effects of clearing or blocking:

- Clearing `aition_user` / `aition_admin`: you will need to log in again;
- Clearing `aition_cookie_consent`: the cookie banner will appear again on your next visit;
- Clearing `aition_vid`: your next visit will be counted as a new visitor; this does not affect your access to any content;
- Blocking strictly necessary cookies: you can still browse public content, but login, comments, submissions and forms will not work.

5.3 In private or incognito browsing, the above cookies and local storage are typically cleared when the session ends.

### 6. Updates and Contact

6.1 We may update this Policy as functionality or the law changes. The updated version takes effect upon publication on this page.

6.2 For questions, comments or suggestions, please contact us:

- Email: 【Email】
- Phone: 【Phone】
- Address: 【Address】
