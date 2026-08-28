import { getSettingGroup } from "@/server/setting";

/**
 * 类型化配置读取层。
 * 默认值与 prisma/seed.ts 保持一致;DB 值优先、默认值兜底,
 * 保证任何配置缺失时系统仍可正常渲染。
 */

// —— 主题 ——
export interface ThemeConfig {
  primary: string; // 主色/按钮色(hex 或 HSL 三元组)
  secondary: string; // 辅助色
  background: string; // 背景色
  foreground: string; // 文字色
  mutedTextColor: string; // 次要/静音文字色(独立于 foreground,不再继承其色相):
  // 面包屑、日期、表格内容、输入框占位文字等全站大量次要文字统一走这个变量
  radius: string; // 圆角
  fontSans: string; // 全站字体
  fontHeading: string; // 标题字体(空=跟随全站)
  fontSize: string; // 基础字号(如 16px)
  lineHeight: string; // 正文行高(如 1.6)
  logoHeight: string; // 页头 LOGO 高度(如 40px)
  navFontSize: string; // 顶部导航字号(如 15px)
  navBold: boolean; // 顶部导航是否加粗
}
const THEME_DEFAULTS: ThemeConfig = {
  primary: "#0f172a",
  secondary: "#f1f5f9",
  background: "#ffffff",
  foreground: "#020817",
  mutedTextColor: "#64748b",
  radius: "0.5rem",
  fontSans: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
  fontHeading: "",
  fontSize: "16px",
  lineHeight: "1.6",
  logoHeight: "40px",
  navFontSize: "15px",
  navBold: false,
};

// —— 品牌 ——
export interface BrandConfig {
  siteName: string;
  logoUrl: string;
  faviconUrl: string;
  icp: string; // 备案号
  copyright: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  socials: { name: string; url: string; qrcodeUrl?: string }[];
  maintenance: boolean; // 维护模式
  maintenanceText: string;
}
const BRAND_DEFAULTS: BrandConfig = {
  siteName: "AitionOWS",
  logoUrl: "",
  faviconUrl: "",
  icp: "",
  copyright: `© ${new Date().getFullYear()} AitionOWS. All rights reserved.`,
  contactPhone: "",
  contactEmail: "",
  contactAddress: "",
  socials: [],
  maintenance: false,
  maintenanceText: "网站维护中,请稍后访问。",
};

// —— 功能开关 ——
export interface FeatureFlags {
  like: boolean;
  share: boolean;
  comment: boolean;
  commentLoginRequired: boolean;
  submission: boolean; // 用户投稿
  forceLogin: boolean; // 强制登录浏览
}
const FEATURE_DEFAULTS: FeatureFlags = {
  like: true,
  share: true,
  comment: true,
  commentLoginRequired: true,
  submission: false,
  forceLogin: false,
};

// —— 上传限制 ——
export const VIDEO_MAX_SIZE_MB = 400; // 视频单文件上限(固定值,不随后台 maxSizeMB 配置)
export interface UploadConfig {
  maxSizeMB: number;
  allowedTypes: string[];
  maxCount: number;
}
const UPLOAD_DEFAULTS: UploadConfig = {
  maxSizeMB: 10,
  // 含 ICO(image/x-icon 与 image/vnd.microsoft.icon 为不同浏览器的上报差异),用于 favicon 场景
  // 视频除 mp4 外放宽常见容器:webm / mov(quicktime) / mkv(matroska)
  allowedTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
    "image/x-icon",
    "image/vnd.microsoft.icon",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-matroska",
  ],
  maxCount: 20,
};

// —— SEO / GEO ——
export interface SeoConfig {
  city: string;
  address: string;
  lat: string;
  lng: string;
  serviceArea: string;
  geoKeywords: string;
  allowIndex: boolean; // robots 是否允许抓取
  aiCrawlAllow: boolean; // 是否允许主流 AI 检索引擎抓取(GEO 策略开关)
  extraDisallow: string; // 额外屏蔽路径(每行一条)
}
const SEO_DEFAULTS: SeoConfig = {
  city: "",
  address: "",
  lat: "",
  lng: "",
  serviceArea: "",
  geoKeywords: "",
  allowIndex: true,
  aiCrawlAllow: true,
  extraDisallow: "",
};

// —— 微信登录 ——
export interface WechatConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  h5AppId: string; // 预留(一期不实现)
  h5AppSecret: string; // 预留
}
const WECHAT_DEFAULTS: WechatConfig = {
  enabled: false,
  appId: "",
  appSecret: "",
  h5AppId: "",
  h5AppSecret: "",
};

// —— 管理员邮件通知(新增需求:表单提交/用户投稿时通知管理员) ——
export interface NotifyConfig {
  enabled: boolean; // 通知总开关(未开启或未配置 SMTP 时静默跳过,不影响提交本身)
  adminEmail: string; // 接收通知的管理员邮箱,支持填多个(英文逗号分隔)
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean; // true=465(SSL)常见;false 配合 587(STARTTLS)或 25
  smtpUser: string;
  smtpPassword: string;
  fromName: string; // 发件人显示名(留空则用站点名)
  fromEmail: string; // 发件人邮箱(留空则用 smtpUser)
}
const NOTIFY_DEFAULTS: NotifyConfig = {
  enabled: false,
  adminEmail: "",
  smtpHost: "",
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: "",
  smtpPassword: "",
  fromName: "",
  fromEmail: "",
};

// —— 错误页文案 ——
export interface ErrorPagesConfig {
  notFoundTitle: string;
  notFoundDesc: string;
  errorTitle: string;
  errorDesc: string;
}
const ERRORS_DEFAULTS: ErrorPagesConfig = {
  notFoundTitle: "404",
  notFoundDesc: "页面不存在或已被移除",
  errorTitle: "500",
  errorDesc: "服务出错了,请稍后重试",
};

// —— 安全 ——
export interface SecurityConfig {
  defaultPwChanged: boolean; // 默认管理员密码是否已修改
}
const SECURITY_DEFAULTS: SecurityConfig = { defaultPwChanged: false };

/** 通用合并:DB 值优先,默认值兜底 */
async function merged<T extends object>(group: string, defaults: T): Promise<T> {
  const db = await getSettingGroup(group);
  return { ...defaults, ...(db as Partial<T>) };
}

export const getThemeConfig = () => merged("theme", THEME_DEFAULTS);
export const getBrandConfig = () => merged("brand", BRAND_DEFAULTS);
export const getFeatureFlags = () => merged("features", FEATURE_DEFAULTS);
export const getUploadConfig = () => merged("upload", UPLOAD_DEFAULTS);
export const getSeoConfig = () => merged("seo", SEO_DEFAULTS);
export const getWechatConfig = () => merged("wechat", WECHAT_DEFAULTS);
export const getNotifyConfig = () => merged("notify", NOTIFY_DEFAULTS);
export const getErrorPagesConfig = () => merged("errors", ERRORS_DEFAULTS);
export const getSecurityConfig = () => merged("security", SECURITY_DEFAULTS);
