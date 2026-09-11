
import { getSettingGroup, saveSettingGroup } from "@/server/setting";

/**
 * 商店设置(V4.0):Setting(group="shop") 平铺键(currency/paymentInfo/运费策略),
 * 与通用 settings API(整组保存)同构。读取容错合并默认值(缺省=USD/无付款指引/免运费),
 * 保存侧收敛校验,保证落库数据始终合法。
 */

export interface ShopConfig {
  /** 站点默认币种(ISO 4217);商品未指定币种时使用 */
  currency: string;
  /** 线下付款指引(银行账户/PayPal 等;展示在下单成功页与下单确认邮件) */
  paymentInfo: string;
  /** 固定运费(整数分);0=免运费 */
  shippingFeeCents: number;
  /** 满额免运费门槛(整数分);null=不启用满额免邮 */
  freeShippingOverCents: number | null;
  /** 是否开启在线下单(V4.3):关闭时前台隐藏购物车/加购/结算入口,商品页与询盘不受限 */
  orderingEnabled: boolean;
}

const DEFAULTS: ShopConfig = {
  currency: "USD",
  paymentInfo: "",
  shippingFeeCents: 0,
  freeShippingOverCents: null,
  orderingEnabled: true, // 缺省开启(存量站点升级零变化)
};

const ISO_CURRENCY = /^[A-Z]{3}$/;

export async function getShopConfig(): Promise<ShopConfig> {
  const raw = await getSettingGroup("shop");
  const currency = ISO_CURRENCY.test(String(raw.currency)) ? String(raw.currency) : DEFAULTS.currency;
  const toCents = (v: unknown, fallback: number | null): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
  };
  return {
    currency,
    paymentInfo: typeof raw.paymentInfo === "string" ? raw.paymentInfo.slice(0, 2000) : DEFAULTS.paymentInfo,
    shippingFeeCents: toCents(raw.shippingFeeCents, DEFAULTS.shippingFeeCents) ?? 0,
    freeShippingOverCents: toCents(raw.freeShippingOverCents, DEFAULTS.freeShippingOverCents),
    // 布尔:显式 false 才关闭;未配置/null/脏值一律按开启(true)——存量零变化
    orderingEnabled: raw.orderingEnabled !== false,
  };
}

/** 保存商店设置(后台);非法字段回退当前值,保证落库合法 */
export async function saveShopConfig(input: Partial<ShopConfig>): Promise<void> {
  const current = await getShopConfig();
  await saveSettingGroup("shop", {
    currency: ISO_CURRENCY.test(String(input.currency)) ? String(input.currency) : current.currency,
    paymentInfo: typeof input.paymentInfo === "string" ? input.paymentInfo.slice(0, 2000) : current.paymentInfo,
    shippingFeeCents: Math.max(0, Math.floor(Number(input.shippingFeeCents))) || 0,
    freeShippingOverCents:
      input.freeShippingOverCents == null
        ? null
        : Math.max(0, Math.floor(Number(input.freeShippingOverCents))) || null,
    orderingEnabled: input.orderingEnabled !== false,
  });
}

/** 运费计算:满额免邮优先,否则固定运费 */
export function calcShipping(itemsTotalCents: number, cfg: ShopConfig): number {
  if (cfg.freeShippingOverCents != null && itemsTotalCents >= cfg.freeShippingOverCents) return 0;
  return cfg.shippingFeeCents;
}
