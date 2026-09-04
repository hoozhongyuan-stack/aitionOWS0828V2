{
  "id": "EVID-114",
  "type": "bugfix-verification",
  "task": "TASK-108",
  "date": "2026-09-04",
  "bug": "DEF-012 根级 not-found 缺根 layout(用户反馈乱路径 500)",
  "fix_commit": "376cd08cd59e05c4893ae74d6cf5207653a48edc",
  "verification": "curl 实测:用户场景 307/无 locale 乱路径 307/语言内乱路径 404 定制页/首页与登录 200 不受影响;vitest 156 测试全绿"
}
