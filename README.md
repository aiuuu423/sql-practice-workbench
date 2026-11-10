# SQL Practice Workbench

本地 MySQL 8.0 SQL 练习工作台，支持真实查询、自动判题、数据库重置和学习档案同步。

## 前置条件

- macOS
- Node.js 20 或更高版本
- MySQL 8.0
- MySQL 服务已启动：`brew services start mysql@8.0`

MySQL 客户端路径：

```bash
/opt/homebrew/opt/mysql@8.0/bin/mysql
```

## 首次设置

进入 `SQL_Interview/app`，安装依赖并创建本地配置：

```bash
npm install
cp .env.example .env
```

在 `.env` 中为 `MYSQL_RUNNER_PASSWORD` 和 `MYSQL_RESET_PASSWORD` 设置两个不同的随机密码。不要提交 `.env`。

启用异步 AI 教练时，在同一个本地 `.env` 中配置火山方舟：

```env
ARK_API_KEY=your_local_key
ARK_MODEL=your_endpoint_or_model_id
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_TIMEOUT_MS=30000
```

`ARK_API_KEY` 只由 Fastify 后端读取，不会返回浏览器、写入日志或提交
Git。未配置方舟时，SQL 执行和判题仍可正常使用。

初始化 schema 和固定测试数据：

```bash
/opt/homebrew/opt/mysql@8.0/bin/mysql --socket=/tmp/mysql.sock -uroot < ../sql/init_database.sql
/opt/homebrew/opt/mysql@8.0/bin/mysql --socket=/tmp/mysql.sock -uroot < ../sql/seed_database.sql
```

加载 `.env` 后，用环境变量替换账号模板中的密码并创建本地账号：

```bash
set -a
source .env
set +a
sed -e "s/:runner_password/${MYSQL_RUNNER_PASSWORD}/g" \
    -e "s/:reset_password/${MYSQL_RESET_PASSWORD}/g" \
    ../sql/create_local_users.sql |
  /opt/homebrew/opt/mysql@8.0/bin/mysql --socket=/tmp/mysql.sock -uroot
```

## 本地开发

```bash
npm run dev
```

浏览器访问 `http://127.0.0.1:5173`。

- `运行`：只执行当前 SQL，不改变通过状态。
- `提交`：执行当前 SQL 和隐藏参考查询，先返回确定性判题，再异步调用
  方舟生成纠错。通过题目或累计第 3、6、9 次错误时生成阶段总结。
- `Cmd+Enter`：运行。
- `Cmd+Shift+Enter`：提交。
- `重置数据`：恢复固定数据库数据，不删除学习进度或编辑器草稿。

## 测试与构建

```bash
npm test
npm run build
npm run test:e2e
```

构建后可由 Fastify 托管前端：

```bash
NODE_ENV=production npm start
```

访问 `http://127.0.0.1:3001`。

## 文件位置

- 题目清单：`app/data/questions.json`
- 隐藏参考答案：`app/data/answers/`
- 当前进度：`app/data/progress.json`
- 提交历史：`app/data/submissions.jsonl`
- AI 反馈历史：`app/data/coach_feedback.jsonl`
- AI 学习画像：`app/data/coach_profile.json`
- 数据库 schema：`sql/init_database.sql`
- 固定数据：`sql/seed_database.sql`

应用只改写学习档案中 `sql-workbench` 或 `sql-coach` 成对标记之间的内容。
`Run` 不调用模型，`Submit` 才触发 AI 教练。自动化测试使用本地假方舟
服务，不会调用真实模型或消耗额度。

## 隐私与发布

以下文件只保存在本机并由 `.gitignore` 排除：

- `app/.env`
- `app/data/progress.json`
- `app/data/submissions.jsonl`
- `app/data/coach_feedback.jsonl`
- `app/data/coach_profile.json`
- 根目录下的个人学习计划、知识笔记、题库状态与错题记录

新环境可从 `docs/learning-archive/` 复制空白模板到项目根目录。应用在缺少
`progress.json` 时会自动创建全新的本地进度。
