---
title: Obsidian Callout 测试
date: 2026-06-27
slug: obsidian-callout-test
tags:
  - daybook
  - obsidian
summary: 测试 Daybook 对 Obsidian Callout、折叠提示块、嵌套提示块和 Callout 内部 Markdown / 双链 / 附件的支持。
draft: true
---

# Obsidian Callout 测试

## 基础类型

> [!note]
> 这是一个普通 Note callout。

> [!tip]
> 这是一个 Tip callout。

> [!important]
> 这是一个 Important callout，应保留紫色样式。

> [!warning]
> 这是一个 Warning callout。

> [!caution]
> 这是一个 Caution callout，应保留红色样式。

## 自定义标题

> [!note] 自定义标题
> 这是一个自定义标题的提示块。

## Title-only Callout

> [!tip] 这是一个只有标题的提示块

## Markdown 正文

> [!info] Markdown 渲染
> 这里包含 **加粗**、*斜体*、`inline code`。
>
> - 列表项一
> - 列表项二
>
> ```go
> fmt.Println("hello callout")
> ```

## Wikilink 与附件

> [!question] 链接与附件
> 这里有一个双链：[[obsidian-embed-test]]
>
> 这里有一张图片：
> ![[add-new-link.png|center|300]]
>
> 这里有一个 PDF：
> ![[实践论.pdf]]

## 默认折叠

> [!faq]- 默认折叠的问题
> 这段内容默认应该折叠。
>
> - 折叠内容里的列表
> - 折叠内容里的 **Markdown**

## 默认展开

> [!success]+ 默认展开的成功提示
> 这段内容默认应该展开，但用户可以手动折叠。

## 嵌套 Callout

> [!question] 外层 Callout
> 这是外层内容。
>
> > [!todo] 内层 Callout
> > 这是内层内容。
> >
> > - 内层列表项
> > - 内层 **Markdown**

## Alias 类型

> [!faq]
> `faq` 应该映射到 question 样式。

> [!tldr]
> `tldr` 应该映射到 abstract 样式。

> [!hint]
> `hint` 应该映射到 tip 样式。

## 自定义未知类型

> [!custom-type] 自定义未知类型
> 未知类型应该 fallback 到 note 样式，但保留 data-callout-original。
