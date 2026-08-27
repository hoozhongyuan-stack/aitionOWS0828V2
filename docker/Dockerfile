# ============================================================
# AitionOWS 生产镜像(多阶段构建)
# 设计取向:自托管企业官网模板,可靠性优先于极致镜像体积——
#          runner 保留完整依赖,保证 prisma 迁移/seed/sharp 均可用。
# ============================================================

# Node 24(与模板开发/验证环境一致;npm 11 原生解析本仓库 lockfile)
FROM node:24-alpine AS base
# Prisma 引擎与部分原生依赖需要:openssl、libc6-compat
RUN apk add --no-cache libc6-compat openssl

# ---------- 依赖安装 ----------
FROM base AS deps
WORKDIR /app
# npm 镜像源可配(国内服务器默认走 npmmirror,海外可 build-arg 覆盖为官方源)
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm config set registry ${NPM_REGISTRY} && npm config set fetch-retries 5
COPY package.json package-lock.json* ./
# 优先 npm ci(锁定版本);lockfile 异常时回退 npm install,保证客户环境首次构建可用
# --ignore-scripts:此阶段尚无 schema.prisma,postinstall(prisma generate)留到构建阶段执行
RUN if [ -f package-lock.json ]; then npm ci --ignore-scripts --no-audit --no-fund || npm install --ignore-scripts --no-audit --no-fund; else npm install --ignore-scripts --no-audit --no-fund; fi

# ---------- 构建 ----------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 构建期占位环境变量:仅满足模块初始化校验(.env 不进镜像),真实值由 compose 运行时注入
ENV DATABASE_URL=file:../data/app.db
ENV AUTH_SECRET=build-time-placeholder
# 生成 Prisma Client 并构建 Next.js(build 脚本内已含 prisma generate)
RUN npm run build

# ---------- 运行 ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# 复制完整应用(含 node_modules,保证运行时可执行 prisma migrate / seed)
COPY --from=builder /app ./

# 运行时数据目录(会被 compose volume 覆盖挂载)
RUN mkdir -p /app/data /app/uploads /app/backups \
  && chmod +x docker/entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["sh", "docker/entrypoint.sh"]
