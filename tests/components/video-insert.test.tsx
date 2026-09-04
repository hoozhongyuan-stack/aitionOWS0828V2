// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { Editor } from "@tiptap/core";

/**
 * DEF-012 根因验证:富文本"插入视频"按钮上传成功但编辑器无反应——
 * insertContent 的 <video> 标签不在 Tiptap schema 中被静默丢弃。
 * 本测试同时锁定修复后的行为(Video 扩展注册后可插入/可序列化)。
 */
function createEditor(extensions: any[]) {
  return new Editor({
    extensions,
    content: "<p></p>",
  });
}

const BASE = [StarterKit.configure({ heading: { levels: [2, 3] } }), Image];

describe("富文本视频插入(DEF-012)", () => {
  beforeEach(() => {});

  it("现状复现:无 Video 扩展时 insertContent <video> 被丢弃", () => {
    const editor = createEditor(BASE);
    editor.commands.insertContent(
      '<video src="/uploads/v.mp4" controls preload="metadata"></video><p></p>'
    );
    const html = editor.getHTML();
    expect(html).not.toContain("<video");
    editor.destroy();
  });

  it("修复后:注册 Video 扩展,insertContent 生成 video 节点", async () => {
    const { Video } = await import("@/components/admin/video-extension");
    const editor = createEditor([...BASE, Video]);
    editor.commands.insertContent(
      '<video src="/uploads/v.mp4" controls preload="metadata"></video><p></p>'
    );
    const html = editor.getHTML();
    expect(html).toContain("<video");
    expect(html).toContain('src="/uploads/v.mp4"');
    expect(html).toContain("controls");
    editor.destroy();
  });

  it("修复后:图片插入不受影响(Image 扩展回归锁)", async () => {
    const editor = createEditor(BASE);
    editor.commands.setImage({ src: "/uploads/i.png", alt: "图" });
    expect(editor.getHTML()).toContain('<img src="/uploads/i.png"');
    editor.destroy();
  });
});
