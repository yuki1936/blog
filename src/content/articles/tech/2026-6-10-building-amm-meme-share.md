---
title: 做了一个表情包分享网站
description: amm-meme-share 的简单介绍与实现记录。
published: 2026-06-10
draft: false
---

我做了一个按角色分类的表情包分享网站。它可以浏览、复制和下载图片，也提供了一个简单的表情包生成器。

- 在线预览：[amm.yuki1936.com](https://amm.yuki1936.com/)
- 源码：[yuki1936/amm-meme-share](https://github.com/yuki1936/amm-meme-share)

## 为什么做这个网站

表情包太多了，单纯想做个网站分享一下，给大家看看。

## 目前的功能

- 按角色整理和浏览表情包
- 复制或下载原图
- 使用模板生成表情包
- 适配桌面端和移动端

## 实现方式

网站使用 React、TypeScript 和 Vite 构建，部署在 Cloudflare Pages。图片及缩略图存放在 Cloudflare R2，通过构建脚本生成图库清单并校验资源。
表情包生成器使用 Canvas 完成文字排版、图片定位和 PNG 导出。

## 之后可能会做的事

持续更新收藏的表情包。