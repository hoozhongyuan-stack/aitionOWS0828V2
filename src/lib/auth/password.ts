import bcrypt from "bcryptjs";

/** 密码哈希(bcrypt,成本因子 10,官网场景足够) */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

/** 密码校验 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
