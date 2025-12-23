---
title: 【技术硬核】白嫖 B2 存储 + Cloudflare Workers，打造永久免费的私有图床 API
date: 2025-12-23
tags: [存储, Cloudflare Workers, Backblaze B2, 图床, 教程]
description: 10GB 免费存储 + 每天 10 万次免费请求 + 全球 CDN 加速 + 0 流量费。
---

> **前言**：
> 上一篇文章我们搞定了免费域名，今天我们来搞定“存储”。
> 很多开发者都有文件存储需求（博客图床、软件分发、个人备份）。S3 太贵，GitHub 有限制。今天我们要介绍的是 **Backblaze B2 + Cloudflare Workers** 的神级组合：**10GB 免费存储 + 每天 10 万次免费请求 + 全球 CDN 加速 + 0 流量费。**
> *还没有域名？请先看上一篇：[零成本申请 .qzz.io 免费域名并托管至 Cloudflare](/posts/free-domain-qzz-io)*

## 1. 为什么是 B2 + CF？

* **带宽联盟 (Bandwidth Alliance)**: 这是核心！通常从对象存储下载文件需要支付“流出流量费”，但 B2 和 CF 是盟友，数据从 B2 传输到 CF 是**免费**的。这意味着你可以把 B2 当作无限流量的源站。
* **Workers**: 我们可以用它重写 URL，把丑陋的 `f002.backblazeb2.com` 变成优雅的 `files.yourdomain.qzz.io`，甚至可以实现鉴权、图片处理等高级功能。

## 2. 准备工作

1. **Backblaze 账号**: 注册即送 10GB 永久免费存储空间。
2. **Cloudflare 账号**: 且已绑定域名（参考上一篇）。

## 3. Backblaze B2 设置

### 3.1 创建 Bucket
1. 登录 Backblaze B2 控制台。
2. 点击 **Create a Bucket**。
3. **Bucket Unique Name**: 起个全球唯一的名字，例如 `my-free-assets-2025`。
4. **Files in Bucket are**: 选择 **Public**。
   > **注意**：私有读写需要更复杂的签名逻辑，本文为了演示方便，采用“公开读 + 鉴权写”的模式。如果你存放敏感数据，请务必设为 Private。
5. 点击 Create a Bucket。

### 3.2 获取密钥 (App Keys)
1. 在左侧菜单点击 **App Keys**。
2. 点击 **Add a New Application Key**。
3. **Name**: 随便填，如 `CF-Worker-Key`。
4. **Allow access to Bucket(s)**: 选择刚才创建的 Bucket。
5. **Type of Access**: Read and Write。
6. 点击 Create New Key。
7. **重要**：复制并保存 `keyID` 和 `applicationKey`，这俩只显示一次！

### 3.3 配置 CORS
为了让你的图片能被网页（如博客）正常加载，必须配置 CORS。
1. 回到 Buckets 页面，点击 Bucket Settings。
2. 找到 **CORS Rules**。
3. 选择 **Share everything in this bucket with all origins**。
4. 或者手动添加规则：
   ```json
   [
     {
       "corsRuleName": "downloadFromAnywhere",
       "allowedOrigins": ["*"],
       "allowedHeaders": ["*"],
       "allowedOperations": ["s3_head", "s3_get"],
       "exposeHeaders": ["ETag"],
       "maxAgeSeconds": 3000
     }
   ]
   ```

## 4. Cloudflare 域名解析

1. 进入你的 `my-cool-project.qzz.io` 管理面板。
2. 点击 **DNS** -> **Records**。
3. 添加 CNAME 记录：
    * **Type**: CNAME
    * **Name**: `img` (即 `img.my-cool-project.qzz.io`)。
    * **Target**: 你的 B2 Friendly URL (在 B2 桶详情页可见，如 `f002.backblazeb2.com`)。
    * **Proxy Status**: 必须开启小黄云 (Proxied)。

## 5. 部署 Workers (核心魔法)

虽然 CNAME 能直接访问，但 URL 路径很长（`/file/bucket-name/xxx.jpg`）。我们用 Workers 来缩短路径并实现上传接口。

### 5.1 创建 Worker
1. 在 Cloudflare 左侧菜单点击 **Workers & Pages**。
2. 点击 **Create Application** -> **Create Worker**。
3. 命名为 `b2-proxy`，点击 Deploy。
4. 点击 **Edit code**。

### 5.2 编写代码
粘贴以下代码（这是一个简化版，支持 GET 下载和 PUT 上传）：

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // 配置你的 B2 信息
    const b2Domain = 'f002.backblazeb2.com'; // 替换为你的 Friendly URL
    const bucketPath = '/file/my-free-assets-2025'; // 替换为 /file/你的Bucket名
    
    // 1. 下载请求 (GET)
    if (request.method === 'GET') {
      // 重写 URL：将 img.site.com/1.jpg -> f002.../file/bucket/1.jpg
      const newUrl = `https://${b2Domain}${bucketPath}${url.pathname}`;
      
      // 发起请求
      const response = await fetch(newUrl, request);
      
      // 重新构建响应，确保 CORS 头正确
      const newResponse = new Response(response.body, response);
      newResponse.headers.set("Access-Control-Allow-Origin", "*");
      return newResponse;
    }

    // 2. 上传请求 (PUT) - 简单的鉴权保护
    if (request.method === 'PUT') {
      // 检查 Header 中的 Auth-Token
      if (request.headers.get("Auth-Token") !== env.SECRET_TOKEN) {
        return new Response("Unauthorized", { status: 403 });
      }
      
      // 注意：此处仅做演示转发。
      // 生产环境建议：
      // 1. 使用 AWS S3 SDK for JS 在客户端直传
      // 2. 或者在此处通过 Workers 计算 S3 签名
      
      // 简单转发模式（不推荐用于大文件）：
      const newUrl = `https://${b2Domain}${bucketPath}${url.pathname}`;
      // 需要自行处理 B2 的鉴权头，这里省略了复杂的签名计算过程
      // 建议配合 PicGo S3 插件直接上传到 B2，只用 Workers 做下载代理
      return new Response("Upload via Worker requires S3 signing logic", { status: 501 });
    }

    return new Response("Method not allowed", { status: 405 });
  }
};
```

### 5.3 绑定路由
1. 回到 Worker 详情页。
2. 点击 **Settings** -> **Triggers**。
3. 点击 **Add route**。
4. Route: `img.my-cool-project.qzz.io/*`。
5. Zone: 选择你的域名。

## 6. 避坑指南 & 优化

### 6.1 缓存规则 (Cache Rules) - 省钱关键！
为了防止 B2 即使免费也被刷爆请求数（B2 每天免费下载请求只有 2500 次，但流量免费），务必在 CF 设置缓存。
1. 进入 Cloudflare 域名主页 -> **Caching** -> **Cache Rules**。
2. Create rule:
   * Name: `Cache B2 Images`
   * Field: `Hostname` equals `img.my-cool-project.qzz.io`
   * Cache eligibility: **Eligible for cache**
   * Edge TTL: **1 month** (或者更久)
   * Browser TTL: **1 month**
3. 这样文件一旦被访问，后续请求全由 CF 扛，回源率为 0，请求数也就不会涨了。

### 6.2 最佳上传姿势：PicGo + S3
不要试图用 Workers 转发上传流量（容易超时且难以处理签名）。推荐使用 **PicGo** 配合 **S3 插件**。
* **插件**: 安装 `picgo-plugin-s3`。
* **配置**:
  * **AccessKeyID / SecretAccessKey**: 填 B2 的 keyID 和 applicationKey。
  * **Bucket**: 你的 Bucket 名。
  * **Region**: `us-west-002` (看你的 B2 Endpoint，如 s3.us-west-002.backblazeb2.com)。
  * **Endpoint**: `https://s3.us-west-002.backblazeb2.com`。
  * **Custom Domain**: `https://img.my-cool-project.qzz.io` (填你的 Worker 域名)。
* **效果**: 截图 -> 自动上传到 B2 -> 剪贴板自动生成 `https://img...` 的链接 -> 粘贴使用。

## 7. 总结

这一套下来，你拥有了：

* **个性化域名** (感谢 .qzz.io)
* **10GB 免费空间** (感谢 Backblaze)
* **CDN 加速与无限流量** (感谢 Cloudflare)
* **自动化工作流** (感谢 PicGo)

这才是真正的“Serverless”白嫖美学！
