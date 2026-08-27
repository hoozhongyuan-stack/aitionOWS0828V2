import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import { getUiOverrides, deepMerge } from "@/server/i18n";

/**
 * next-intl 每次请求的配置。
 * 文案来源:messages/{locale}.json(兜底)← DB UiTranslation 覆盖(优先)。
 * 后台改文案 → i18n 缓存失效 → 下一请求生效。
 */
export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // 兜底为默认语言
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  const fileMessages = (await import(`../../messages/${locale}.json`)).default as Record<string, unknown>;
  let messages = fileMessages;
  try {
    const overrides = await getUiOverrides(locale);
    if (Object.keys(overrides).length > 0) {
      messages = deepMerge(fileMessages, overrides);
    }
  } catch {
    // DB 未就绪(如构建期)→ 纯文件兜底
  }

  return {
    locale,
    messages: messages as never,
    timeZone: "Asia/Shanghai",
  };
});
