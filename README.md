# 拾答 · 活动反馈问卷

一个独立的小型全栈项目。主办方在网页编辑和发布问卷，参与者通过微信小程序或网页填写，主办方按发布版本统计结果并导出 CSV。

参考了 [Formbricks 的问卷编辑器](https://github.com/formbricks/formbricks/tree/main/apps/web/modules/survey/editor)、[公开填写入口](https://github.com/formbricks/formbricks/tree/main/apps/web/modules/survey/link)和[问卷与答卷模型](https://github.com/formbricks/formbricks/blob/main/docs/development/technical-handbook/database-model.mdx)。界面、接口和数据模型为本项目编写。

## 本地运行

### 免费演示

本机已有依赖和网页构建产物时，在项目目录运行 `./start-demo.ps1`。脚本启动本机服务，并使用单独的演示数据库 `data/local-demo.sqlite3`。它会在首次启动时加入一份虚构问卷和 8 份答卷。要退出，在启动终端按 Ctrl+C。

- [问卷工作台](http://127.0.0.1:8000/)
- [手机网页填写](http://127.0.0.1:8000/s/market-feedback)

用同一台电脑上的浏览器可以完成编辑、发布、填写和统计。微信开发者工具的本机调试包也连接此服务。

### 从头安装

在项目根目录使用 PowerShell。需要 Python 3.11+ 和兼容当前前端依赖的 Node.js，项目以 Node.js 24 验证。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
npm --prefix web ci
npm --prefix web run build
$env:SURVEY_LOCAL_DEV = '1'
$env:SURVEY_SEED_DEMO = '1'
.\.venv\Scripts\python.exe -m uvicorn server.main:create_app_from_env --factory --host 127.0.0.1 --port 8000
```

打开 [问卷工作台](http://127.0.0.1:8000/) 或 [示例填写页](http://127.0.0.1:8000/s/market-feedback)。示例自带 8 份虚构答卷。默认使用本地 SQLite，数据库文件位于 `data/surveys.db`。要从空库启动，关闭 `SURVEY_SEED_DEMO` 并指定一个新的数据库文件。

开发网页时保持 API 运行，在第二个终端执行 `npm --prefix web run dev`，访问它输出的地址。

### 小程序

```powershell
npm --prefix mini-program ci
npm --prefix mini-program run typecheck
npm --prefix mini-program run build
```

在微信开发者工具中导入 `mini-program`，构建产物位于 `dist`。本机模拟器默认请求 `http://127.0.0.1:8000`，需要在开发者工具中开启本地调试的域名校验豁免。可输入 `market-feedback`，或把启动参数配置为 `pages/fill/index?id=market-feedback`。

真机联调或提交审核时，先在微信后台配置 API 请求域名，然后用自己的 AppID 构建。正式构建将 AppID 写入构建产物，本地调试配置仍用测试 AppID。

```powershell
$env:SURVEY_MINI_API_BASE = 'https://你的API域名'
$env:SURVEY_MINI_APP_ID = '你的小程序AppID'
npm --prefix mini-program run build:release
```

在微信开发者工具中导入 `mini-program/dist`。公开环境设置 `SURVEY_ADMIN_TOKEN` 并关闭 `SURVEY_LOCAL_DEV`，网页会要求输入后台访问口令。

### PostgreSQL

如已装 Docker，可运行 `docker compose up -d database`。启动 API 前将 `SURVEY_DATABASE_URL` 设置为 `postgresql+psycopg://survey:survey-local@127.0.0.1:5435/surveys`。Compose 中的用户和口令用于本机演示。

## 免费公网演示

网页端和 API 由同一个 [Render 免费 Web Service](https://render.com/docs/free) 提供，答卷保存在 [Neon 免费 PostgreSQL](https://neon.com/docs/introduction/plans)。

1. 在 Neon 创建一个用于演示的 Free 项目，通过 Connect 取得 PostgreSQL 连接地址。
2. 将项目源码推送到自己的 Git 仓库。在 Render 新建 Blueprint 并选择该仓库，读取根目录的 `render.yaml`。把 Neon 的连接地址填入 `SURVEY_DATABASE_URL`。Render 会生成后台口令 `SURVEY_ADMIN_TOKEN`，在服务的 Environment 页面可查看。
3. 部署成功后，用分配的 HTTPS 地址打开工作台。发给体验者的是同域名下的 `/s/market-feedback`，他们可以直接在手机浏览器填写。演示问卷和样例答卷会在首次启动时生成。

部署配置使用 Render 的 Free 计划。服务闲置后首次访问可能需要等待启动。

## 验证主流程

1. 在工作台新建问卷，添加单选、多选或简答题并发布。
2. 从「分享」获取网页链接或小程序路径，完成一份答卷。
3. 回到统计页查看答卷与 CSV。修改题目并发布新版本后，切回旧版查看它的题目和原始答卷。

```powershell
.\.venv\Scripts\python.exe -m unittest server.test_surveys
```

可将 `SURVEY_TEST_POSTGRES_URL` 设置为 PostgreSQL 连接地址，再运行同一条命令。测试为每个用例创建独立的随机 schema，退出后清理测试数据。

编辑时用草稿修订号防止覆盖别人的更改。每次发布保存完整题目快照，同一份答卷用提交 ID 去重。统计和导出都按指定版本查询。
