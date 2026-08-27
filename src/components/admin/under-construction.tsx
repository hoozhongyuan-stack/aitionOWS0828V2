import { Hammer } from "lucide-react";

/** 模块占位(开发推进中逐个替换为真实功能) */
export function UnderConstruction({ title }: { title: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
        <Hammer className="h-4 w-4" />
        模块开发中,即将上线。
      </div>
    </div>
  );
}
