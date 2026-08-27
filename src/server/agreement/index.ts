import { prisma } from "@/lib/db";
import { routing } from "@/i18n/routing";

/**
 * 用户协议服务:协议内容按语言存储,前台展示时逐层兜底(当前语言 → 默认语言 → 任意语言)。
 * 类型:REGISTER(注册协议)/ PRIVACY(隐私政策)。
 */

/** 前台:按类型取协议,带语言兜底链 */
export async function getAgreementForLocale(locale: string, type: string) {
  return (
    (await prisma.agreement.findUnique({ where: { type_locale: { type, locale } } })) ??
    (await prisma.agreement.findUnique({
      where: { type_locale: { type, locale: routing.defaultLocale } },
    })) ??
    (await prisma.agreement.findFirst({ where: { type } }))
  );
}

/** 后台:精确读取某语言版本(无兜底,缺省返回 null 由调用方给空模板) */
export async function getAgreementExact(type: string, locale: string) {
  return prisma.agreement.findUnique({ where: { type_locale: { type, locale } } });
}

/** 后台:保存某语言版本 */
export async function saveAgreement(type: string, locale: string, title: string, body: string) {
  await prisma.agreement.upsert({
    where: { type_locale: { type, locale } },
    update: { title, body },
    create: { type, locale, title, body },
  });
}
