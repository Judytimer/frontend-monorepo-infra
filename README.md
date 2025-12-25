# AI 辅助配置的碰壁历程（更详细时间线版）

## 0）目标与起点
我想在一个从零创建的 monorepo 里完成：

- 本地 Verdaccio 私仓
- .npmrc scope 分流（只让 @test/* 走私仓）
- libs / hooks 包拆分、构建、发布、验证
- 最终推送到 GitHub

## 1）第一次明显碰壁：把 .npmrc 配置当成 shell 命令执行了
### 现象（真实日志）
我在终端里输入了：

```bash
@test:registry=http://localhost:4873/
```

结果 bash 报错：

```text
bash: @test:registry=http://localhost:4873/: No such file or directory
```

### 根因
这一行本来应该写进 .npmrc（配置文件），而不是在终端执行。
bash 把它当成“要运行的命令/路径”，自然找不到。

### 修正
我把它放回到项目 .npmrc，并且补齐默认 registry，形成“正确分流”：

```ini
registry=https://registry.npmjs.org/
@test:registry=http://localhost:4873/
```

### 学到的工程点
- shell 里执行的是命令；.npmrc 里写的是配置。
- “scope 分流”必须靠配置文件生效，而不是靠命令执行。

## 2）第二次碰壁：npm install “没反应”，导致我怀疑步骤错了
### 现象（你当时的感受）
你看到步骤里写了安装，但在终端里感觉“没有明显输出”，所以你说：

“第二步我没看出来 npm install 在哪”

“我已经换了，没反应呢”

### 根因（最常见的实际原因）
- workspace 的依赖树没有被强制重新扫描（npm 有时会显得“安静”）
- 或者装过 / 缓存命中导致输出很少
- 也可能是在错误目录执行导致没有变化

### 修正（我们做的确认动作）
用“能出结论”的验证方式，而不是凭感觉：

```bash
npm ls microbundle
npx microbundle --version
```

最终你看到：

```text
microbundle, 0.15.1
```

### 学到的工程点
- 不要用“有没有输出”判断是否成功，用“可验证命令”判断状态。

## 3）第三次碰壁：publish 时报 ECONNREFUSED，发现 Verdaccio 根本没在跑
### 现象（真实日志）
你执行：

```bash
npm publish --registry http://localhost:4873/
```

最后报错：

```text
connect ECONNREFUSED 127.0.0.1:4873
```

同时你验证：

```bash
curl http://localhost:4873/
```

返回：

```text
Failed to connect to localhost port 4873
```

并且你运行：

```bash
verdaccio
```

显示：

```text
verdaccio: command not found
```

### 根因
- registry 地址没问题
- 真正的问题是：4873 上没有服务在监听
- 也就是 Verdaccio 没启动（或没安装为全局命令）

### 修正
用 npx 启动 Verdaccio（避免全局命令不存在）：

```bash
npx verdaccio
```

再 publish 后，你确实看到了成功行：

```text
+ @test/address-format@1.0.0
```

### 学到的工程点
- 发布失败先别怀疑配置，先确认“服务是否在线”（端口 / curl / UI）。

## 4）第四次碰壁：发布成功了，但 Verdaccio UI 首页“看不到包”
### 现象
你看到终端已经成功：

```text
+ @test/address-format@1.0.0
```

但 Verdaccio 页面没有立刻展示新包，于是你怀疑“没提交上去”。

### 根因
Verdaccio UI 首页并不会保证“自动列出所有新包”，更可靠的是：
- 搜索包名
- 或用 registry API / CLI 查询

### 修正（硬核确认）
你执行：

```bash
npm view @test/address-format --registry http://localhost:4873/
```

并拿到了 tarball / version 信息，最终 UI 也能搜索到它。

### 学到的工程点
- UI 是展示层，不是事实源；以 npm view 为准。

## 5）第五次碰壁：从 npm 切 pnpm，暴露“私仓未配置上游代理”的问题
### 现象（真实日志特征）
pnpm install 大量请求：

```text
GET http://localhost:4873/@babel/core ...
ERR_SOCKET_TIMEOUT
ERR_PNPM_META_FETCH_FAIL
```

随后导致构建阶段：

```text
microbundle: not found
```

### 根因
- pnpm 更严格，会严格遵循 registry 路由
- 你的 Verdaccio 当时没有配置 uplink/proxy 到官方 npm
- 所以 pnpm 试图从私仓拉所有公共依赖 → 超时
- 同时由于 install 没完成，microbundle 没装上 → 命令不存在

### 修正（工程取舍）
为了“按时收官作业”，我选择：
- 用 npm 完成作业闭环（你已成功 publish）
- pnpm 作为后续优化项（等 Verdaccio proxy 配好再迁移）

### 学到的工程点
- pnpm 更像“边界检测器”；基础设施没齐时，用 npm 更利于先交付。

## 6）第六次碰壁：GitHub 推送失败，最终发现是代理导致
### 现象（真实日志）
HTTPS push 报：

```text
Proxy CONNECT aborted
```

SSH 也报 proxy 相关错误。

### 根因
Git 仍被代理影响（可能来自 global git proxy / 环境变量代理）。
即使你设置了 http.noProxy=github.com，环境层面仍可能强制走代理。

### 修正
你最终通过移除全局 git proxy 等方式推送成功：

main 已跟踪 origin/main，push 成功。

### 学到的工程点
- 代理问题优先排查：环境变量 → git 全局配置 → repo 配置。
