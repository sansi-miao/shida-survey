const { spawnSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");
const { isIP } = require("node:net");
const path = require("node:path");

const appId = process.env.SURVEY_MINI_APP_ID?.trim();
const api = URL.parse(process.env.SURVEY_MINI_API_BASE?.trim() || "");
if (!/^wx[0-9a-f]{16}$/i.test(appId || "")) {
  console.error("请将 SURVEY_MINI_APP_ID 设置为微信公众平台上的小程序 AppID。");
  process.exit(1);
}
if (
  !api || api.protocol !== "https:" || api.username || api.password ||
  api.port || api.pathname !== "/" || api.search || api.hash ||
  !api.hostname.includes(".") || isIP(api.hostname) || api.hostname.endsWith(".localhost")
) {
  console.error("请将 SURVEY_MINI_API_BASE 设置为已在微信配置的 HTTPS API 域名。");
  process.exit(1);
}

const project = path.resolve(__dirname, "..");
const cli = require.resolve("@tarojs/cli/bin/taro");
const build = spawnSync(process.execPath, [cli, "build", "--type", "weapp"], {
  cwd: project,
  stdio: "inherit",
  env: { ...process.env, SURVEY_MINI_API_BASE: api.origin },
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const outputConfig = path.join(project, "dist", "project.config.json");
const config = JSON.parse(readFileSync(outputConfig, "utf8"));
config.appid = appId;
writeFileSync(outputConfig, JSON.stringify(config, null, 2) + "\n");
console.log("正式构建完成。可在微信开发者工具中导入 mini-program/dist。");
