---
title: Obsidian 注释与高亮测试
date: 2026-06-27
slug: obsidian-comments-highlight-test
tags:
  - daybook
  - obsidian
summary: 测试 Daybook 对 Obsidian 注释与高亮语法的支持。
draft: true
---

# Obsidian 注释与高亮测试

## 基础高亮

这是一段 ==高亮文本==。

这是一段包含中文、English 和 123 的 ==混合高亮内容==。

## 多个高亮

这里有 ==第一个高亮==，这里有 ==第二个高亮==。

## 注释移除

这段文字应该显示。

%% 这是一段不应该发布的 Obsidian 注释。 %%

这段文字也应该显示。

## 多行注释

这段文字在注释之前。

%%
这是一段多行注释。
这里的内容不应该出现在最终 HTML 中。
%%

这段文字在注释之后。

## 行内代码不应解析

行内代码中的 `==高亮不应生效==` 应该保持原样。

行内代码中的 `%% 注释不应移除 %%` 应该保持原样。

## 代码块不应解析

```md
==代码块里的高亮不应生效==

%% 代码块里的注释不应移除 %%
```

## 数学公式不应解析

行内数学 `$a == b$` 不应被高亮解析。

块级数学：

$$
a == b
%% math comment should stay %%
$$

## Callout 内部高亮

> [!note] 高亮测试
> Callout 里面的 ==高亮文本== 应该正常渲染。
>
> %% Callout 里的注释不应该发布。 %%

## Wikilink 附近高亮

这里有一个双链 [[obsidian-callout-test]]，旁边有 ==高亮文本==。

## 附件附近高亮

这里有图片附件：

![[add-new-link.png|center|300]]

下面这行有 ==附件说明高亮==。
