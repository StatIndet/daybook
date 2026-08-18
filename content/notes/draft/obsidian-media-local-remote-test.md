---
title: Obsidian 本地与远程附件测试
date: 2026-06-27
tags:
  - daybook
  - obsidian
summary: 测试 Daybook 对本地附件和 Cloudflare R2 远程附件的图片、PDF、音频、视频嵌入支持。
draft: false
---

# Obsidian 本地与远程附件测试

这篇文章用于测试 Daybook 的附件发布策略：`content/attachments/` 根目录直属文件走本地 local，`audio/`、`video/`、`picture/`、`pdf/` 子目录走远程 R2。

## 本地图片：add-new-link.png

![[attachments/picture/shi-li.jpg]]

## 本地图片：br0.png

![[attachments/shi-li.jpg]]

## 本地图片：居中并指定宽度

![[add-new-link.png|center|500]]

## 本地 PDF：实践论.pdf

![[实践论.pdf]]

## 本地音频：周杰伦 - 牛仔很忙.FLAC

![[周杰伦 - 牛仔很忙.FLAC]]

## 远程附件

::pdf{url="https://static.daybook.page/pdf/shi-jian-lun.pdf"} 

::video{url="https://static.daybook.page/video/1130650335-1-208.mp4" width="720" align="center"} 

::audio{url="https://static.daybook.page/audio/JayChou-ai-zai-xi-yuan-qian.FLAC"} 

::image{url="https://static.daybook.page/picture/shelby.jpg" width="720" align="center"} 

::music{url="https://static.daybook.page/music/1406633327.flac"}

## 缺失本地附件测试

![[missing-local-file.png]]

## 缺失远程附件测试

![[audio/missing-remote-audio.flac]]
