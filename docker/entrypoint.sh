#!/bin/sh
# ============================================================
# 容器启动脚本:实现"一键部署,自动初始化"
#   1) 确保运行时目录存在
#   2) 同步数据库结构(有迁移用 migrate deploy,无迁移用 db push)
#   3) 幂等 seed(默认管理员/配置/语言)
#   4) 启动 Next.js
# ============================================================
set -e

echo "==> 初始化运行时目录"
mkdir -p /app/data /app/uploads /app/backups

echo "==> 同步数据库结构"
# 仅当存在真实迁移目录时才走 migrate deploy(排除 .gitkeep / migration_lock.toml 等占位文件)
if [ -d /app/prisma/migrations ] && [ -n "$(ls -A /app/prisma/migrations 2>/dev/null | grep -v -e migration_lock.toml -e '^\.')" ]; then
  echo "    检测到迁移文件,执行 migrate deploy"
  npx prisma migrate deploy
else
  echo "    无迁移文件,执行 db push(首次/模板部署)"
  npx prisma db push --skip-generate
fi

echo "==> 初始化种子数据(幂等)"
npx prisma db seed || echo "    seed 跳过或失败,继续启动"

echo "==> 启动应用(端口 ${PORT:-3000})"
exec npm run start
