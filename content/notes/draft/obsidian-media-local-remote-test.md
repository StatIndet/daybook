---
title: Obsidian 本地与远程附件测试
date: 2026-06-27
slug: obsidian-media-local-remote-test
tags:
  - daybook
  - obsidian
summary: 测试 Daybook 对本地附件和 Cloudflare R2 远程附件的图片、PDF、音频、视频嵌入支持。
draft: true
---

# Obsidian 本地与远程附件测试

这篇文章用于测试 Daybook 的附件发布策略：`content/attachments/` 根目录直属文件走本地 local，`audio/`、`video/`、`picture/`、`pdf/` 子目录走远程 R2。

## 本地图片：add-new-link.png

![[add-new-link.png]]

## 本地图片：br0.png

![[br0.png]]

## 本地图片：居中并指定宽度

![[add-new-link.png|center|500]]

## 本地 PDF：实践论.pdf

![[实践论.pdf]]

## 本地音频：周杰伦 - 牛仔很忙.FLAC

![[周杰伦 - 牛仔很忙.FLAC]]

## 远程图片：picture/shelby.jpg

![[picture/shelby.jpg]]

## 远程图片：居中并指定宽度

![[picture/shelby.jpg|center|500]]

## 远程 PDF：pdf/shi-jian-lun.pdf

![[pdf/shi-jian-lun.pdf]]

## 远程音频：audio/JayChou-ai-zai-xi-yuan-qian.FLAC

![[audio/JayChou-ai-zai-xi-yuan-qian.FLAC]]

## 远程视频：video/1130650335-1-208.mp4

![[video/1130650335-1-208.mp4]]

## 远程视频：居中并指定宽度

![[video/1130650335-1-208.mp4|center|720]]

## 缺失本地附件测试

![[missing-local-file.png]]

## 缺失远程附件测试

![[audio/missing-remote-audio.flac]]
