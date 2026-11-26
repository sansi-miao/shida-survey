import { defineConfig } from "@tarojs/cli";

const apiBase = process.env.SURVEY_MINI_API_BASE || "http://127.0.0.1:8000";

export default defineConfig({
  projectName: "feedback-survey",
  designWidth: 750,
  sourceRoot: "src",
  outputRoot: "dist",
  framework: "react",
  compiler: "webpack5",
  plugins: ["@tarojs/plugin-platform-weapp"],
  defineConstants: { SURVEY_API_BASE: JSON.stringify(apiBase.replace(/\/$/, "")) },
  cache: { enable: false },
  mini: {},
});
