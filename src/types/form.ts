import { z } from "zod";

/**
 * 自定义表单字段结构(需求 4.5)。
 * Form.schema 存储 FormField[] 的 JSON;前后端共用此定义。
 */

export const FIELD_TYPES = ["text", "textarea", "radio", "checkbox", "select", "date", "file"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FormField {
  id: string; // 字段唯一 ID(同时作为提交数据的键)
  type: FieldType;
  label: string; // 字段名(展示)
  placeholder?: string; // 提示文案
  required: boolean;
  options?: string[]; // radio/checkbox/select 的选项
  pattern?: string; // 自定义正则校验(可选)
  patternMsg?: string; // 正则不通过时的提示
}

export const formFieldSchema = z.object({
  id: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  label: z.string().min(1),
  placeholder: z.string().optional(),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  pattern: z.string().optional(),
  patternMsg: z.string().optional(),
});

export const formFieldsSchema = z.array(formFieldSchema);

/** 解析 Form.schema JSON(容错) */
export function parseFormFields(schemaJson: string): FormField[] {
  try {
    const parsed = formFieldsSchema.safeParse(JSON.parse(schemaJson));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
