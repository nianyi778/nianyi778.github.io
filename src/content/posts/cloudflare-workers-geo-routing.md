---
title: 🌐 使用 Cloudflare Workers 实现全球智能分流 —— 海内外访问加速实践
description: 利用 Cloudflare Workers 边缘计算能力，根据用户地理位置智能路由，大陆用户走日本 VPS 中转，海外用户直连 Cloudflare，实现全球低延迟访问
date: 2026-01-25T00:00:00+08:00
tags:
  - Cloudflare Workers
  - 网络优化
  - Nginx
  - 全球加速
  - 边缘计算
---

> **版本**: 1.0  
> **最后更新**: 2026-01-25  
> **状态**: ✅ 已实战验证可用  
> **架构**: Cloudflare Workers (边缘路由) + Oracle Cloud Japan (中转) + Cloudflare Pages/Workers (源站)

---

## 1. 背景与问题

### 项目介绍

[StarFlix](https://star.divinations.top) 是一个基于 Cloudflare 全家桶构建的电影流媒体平台：

- **前端**: Next.js 15 + Cloudflare Pages
- **后端**: Hono + Cloudflare Workers + D1
- **域名**: Cloudflare DNS

作为一个面向全球用户的项目，我们面临一个经典问题：**如何同时优化大陆和海外用户的访问速度？**

### 遇到的问题

由于众所周知的原因，大陆用户直接访问 Cloudflare 的体验并不理想。于是我们在日本大阪部署了一台 VPS 作为中转（详见 [中国大陆网络访问优化指南](/posts/china-network-optimization-guide)）：

```
大陆用户 → star.divinations.top (大阪 VPS) → Cloudflare Origin
```

这个方案对大陆用户效果很好，延迟从 300ms+ 降到了 50-80ms。

**但问题来了**：海外用户本来可以直连 Cloudflare 边缘节点（延迟 20-50ms），现在却被迫绕道大阪 VPS，延迟反而增加到了 150ms+。

```
之前的架构（所有流量都经过大阪）：

                    star.divinations.top
                            ↓
                   DNS 解析到大阪 VPS IP
                            ↓
                 ┌──────────────────────┐
                 │    大阪 VPS (nginx)   │ ← 所有用户都经过这里
                 └──────────────────────┘
                            ↓
                 star-origin.divinations.top
                            ↓
                    Cloudflare Pages
```

**需求**：让大陆用户继续走大阪 VPS，海外用户直连 Cloudflare。

---

## 2. 方案选型

| 方案 | 成本 | 复杂度 | 效果 | 说明 |
|------|------|--------|------|------|
| **Cloudflare 地理位置路由** | Enterprise | 低 | 最佳 | 需要企业版，成本高 |
| **DNSPod 分区解析** | 免费 | 中 | 好 | 需要更换 DNS 服务商 |
| **双域名 + 前端切换** | 免费 | 中 | 好 | 用户需要手动选择或前端检测 |
| **Cloudflare Workers** | 免费 | 中 | 好 | 边缘判断，用户无感知 |

最终选择 **Cloudflare Workers** 方案，原因：

1. **用户无感知** - 同一个域名，自动路由
2. **边缘判断** - 在 Cloudflare 全球边缘节点上执行，延迟最低
3. **免费额度足够** - 10 万次请求/天，个人项目完全够用
4. **无需更换 DNS** - 继续使用 Cloudflare DNS

---

## 3. 技术架构

### 3.1 目标架构

```
                         用户访问
                            ↓
                   star.divinations.top
                            ↓
                  ┌─────────────────────┐
                  │  Cloudflare Workers │  ← 在边缘节点判断地区
                  │    (Geo Router)     │
                  └─────────────────────┘
                            ↓
              ┌─────────────┴─────────────┐
              ↓                           ↓
         CN/HK/MO 用户                  其他地区
              ↓                           ↓
    osaka.divinations.top      star-origin.divinations.top
              ↓                           ↓
         大阪 VPS (nginx)           Cloudflare 直连
              ↓
    star-origin.divinations.top
              ↓
        Cloudflare Pages
```

### 3.2 核心原理

Cloudflare Workers 运行在全球 300+ 个边缘节点上。当请求到达时，Cloudflare 会自动在 `request.cf` 对象中注入用户的地理位置信息：

```typescript
const country = request.cf?.country  // "CN", "US", "JP", etc.
```

我们利用这个信息，在边缘节点上决定将请求转发到哪里：

- `country === 'CN'` → 转发到大阪 VPS
- 其他 → 直接转发到 Cloudflare Origin

这样判断逻辑在离用户最近的边缘节点执行，几乎不增加延迟。

### 3.3 流量路径对比

| 用户 | 之前 | 之后 |
|------|------|------|
| 大陆 | 用户 → 大阪 VPS → CF Origin | 用户 → CF Edge → 大阪 VPS → CF Origin |
| 海外 | 用户 → 大阪 VPS → CF Origin | 用户 → CF Edge → CF Origin 直连 |

大陆用户多了一跳 CF Edge，但这一跳在边缘网络内部，延迟 < 10ms，几乎无感。

海外用户省掉了大阪 VPS 这一跳，延迟大幅降低。

---

## 4. 实现步骤

### 4.1 创建 Geo Router Worker

**目录结构**：

```
workers/
├── geo-router-web/
│   ├── wrangler.toml
│   └── src/index.ts
└── geo-router-api/
    ├── wrangler.toml
    └── src/index.ts
```

**Web Router 代码** (`workers/geo-router-web/src/index.ts`)：

```typescript
/**
 * Geo Router for Web (star.divinations.top)
 * 
 * 根据用户地理位置路由请求：
 * - 大陆用户 → 大阪 VPS → CF Pages
 * - 海外用户 → CF Pages 直连
 */

// 大陆用户走大阪 VPS 中转
const CN_BACKEND = 'https://osaka.divinations.top'
// 海外用户直连 Cloudflare Pages
const GLOBAL_BACKEND = 'https://star-origin.divinations.top'

// 需要走大阪中转的国家/地区代码
const CN_REGIONS = new Set(['CN', 'HK', 'MO'])

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const cf = request.cf as { country?: string; colo?: string } | undefined
      const country = cf?.country || 'US'
      const colo = cf?.colo || 'unknown'
      const isCN = CN_REGIONS.has(country)

      const backend = isCN ? CN_BACKEND : GLOBAL_BACKEND
      const targetUrl = new URL(request.url)
      targetUrl.hostname = new URL(backend).hostname
      targetUrl.protocol = 'https:'

      // 构建新请求，保留原始 headers
      const headers = new Headers(request.headers)
      headers.set('X-Real-IP', headers.get('CF-Connecting-IP') || '')
      headers.set('X-Forwarded-For', headers.get('CF-Connecting-IP') || '')
      headers.set('X-Forwarded-Proto', 'https')

      const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'follow',
      })

      // 添加调试 headers
      const newHeaders = new Headers(response.headers)
      newHeaders.set('X-Geo-Route', isCN ? 'cn-osaka' : 'global-cf')
      newHeaders.set('X-Geo-Country', country)
      newHeaders.set('X-Geo-Colo', colo)

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      })
    } catch (error) {
      // 发生错误时降级到全球后端
      console.error('Geo router error:', error)
      
      const targetUrl = new URL(request.url)
      targetUrl.hostname = new URL(GLOBAL_BACKEND).hostname

      return fetch(targetUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
      })
    }
  },
}
```

API Router 代码类似，只需修改 `CN_BACKEND` 和 `GLOBAL_BACKEND` 的值。

### 4.2 大阪 VPS nginx 配置

大阪 VPS 需要配置新的域名 `osaka.divinations.top`：

```nginx
# /etc/nginx/sites-available/starflix-geo.conf

server {
    listen 80;
    server_name osaka.divinations.top;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name osaka.divinations.top;

    # SSL 证书 (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/osaka.divinations.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/osaka.divinations.top/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    location / {
        # ⭐ 关键：动态 DNS 解析
        resolver 1.1.1.1 8.8.8.8 valid=300s ipv6=off;
        resolver_timeout 5s;

        proxy_pass https://star-origin.divinations.top;
        proxy_set_header Host star-origin.divinations.top;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # ⭐ 核心：SNI 设置
        proxy_ssl_server_name on;
        proxy_ssl_name star-origin.divinations.top;
        proxy_ssl_verify off;
        
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /health {
        return 200 'OK';
        add_header Content-Type text/plain;
    }
}
```

**部署命令**：

```bash
# 获取 SSL 证书
sudo certbot certonly --nginx -d osaka.divinations.top -d osaka-api.divinations.top

# 启用配置
sudo ln -sf /etc/nginx/sites-available/starflix-geo.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 4.3 DNS 配置

在 Cloudflare Dashboard 添加以下 DNS 记录：

| 类型 | 名称 | 内容 | 代理状态 |
|------|------|------|----------|
| A | `osaka` | 大阪 VPS IP | ⚪ 仅 DNS |
| A | `osaka-api` | 大阪 VPS IP | ⚪ 仅 DNS |

> **注意**：`osaka` 和 `osaka-api` 必须关闭 Cloudflare 代理（灰云），否则会形成循环。

### 4.4 部署 Workers

```bash
# 部署 Web Router
pnpm wrangler deploy workers/geo-router-web/src/index.ts --name star-geo-router-web

# 部署 API Router
pnpm wrangler deploy workers/geo-router-api/src/index.ts --name star-geo-router-api
```

### 4.5 绑定自定义域名

在 Cloudflare Dashboard:

1. 进入 **Workers & Pages**
2. 选择 `star-geo-router-web`
3. **Settings** → **Domains & Routes** → **Add Custom Domain**
4. 输入 `star.divinations.top`
5. 对 `star-geo-router-api` 重复，添加 `star-api.divinations.top`

---

## 5. 验证与测试

### 5.1 检查路由 Headers

```bash
# 从不同地区测试
curl -I https://star.divinations.top 2>&1 | grep -i x-geo

# 预期输出（大陆）：
X-Geo-Route: cn-osaka
X-Geo-Country: CN
X-Geo-Colo: HKG

# 预期输出（海外）：
X-Geo-Route: global-cf
X-Geo-Country: US
X-Geo-Colo: SJC
```

### 5.2 检查大阪 VPS 日志

```bash
# 只有大陆用户的请求会出现在日志中
sudo tail -f /var/log/nginx/osaka-web-access.log
```

### 5.3 延迟测试

可以使用在线工具如 [ping.pe](https://ping.pe) 或 [check-host.net](https://check-host.net) 从全球多个节点测试延迟。

---

## 6. 效果对比

| 用户地区 | 之前延迟 | 之后延迟 | 改善 |
|----------|----------|----------|------|
| 大陆 (北京) | ~60ms | ~65ms | 持平 |
| 大陆 (上海) | ~50ms | ~55ms | 持平 |
| 美国西海岸 | ~180ms | ~30ms | **-83%** |
| 美国东海岸 | ~220ms | ~50ms | **-77%** |
| 欧洲 | ~250ms | ~40ms | **-84%** |
| 日本 | ~80ms | ~20ms | **-75%** |

大陆用户延迟基本持平（多了一跳 CF Edge，但很小），海外用户延迟大幅降低。

---

## 7. 扩展思考

### 7.1 可扩展场景

这个方案不仅适用于「大陆 vs 海外」分流，还可以扩展到：

1. **多区域加速** - 不同地区使用不同的中转节点（如欧洲用户走法兰克福）
2. **A/B 测试** - 按地区或比例分流到不同后端
3. **灰度发布** - 新版本先在特定地区上线
4. **故障转移** - 主节点故障时自动切换到备用节点

### 7.2 其他优化方向

1. **开启 HTTP/3 (QUIC)** - 在 Cloudflare Dashboard 开启，进一步降低延迟
2. **边缘缓存** - 利用 Cloudflare Cache 缓存静态资源
3. **VPS 内核优化** - 开启 BBR、调整 TCP 参数

---

## 8. 总结

通过 Cloudflare Workers 的边缘计算能力，我们实现了：

| 收益 | 说明 |
|------|------|
| 🎯 用户无感知的智能分流 | 同一个域名，自动选择最优路径 |
| 🇨🇳 大陆用户体验保持 | 继续走大阪 VPS 中转 |
| 🌍 海外用户体验大幅提升 | 直连 Cloudflare 边缘节点 |
| 💰 零额外成本 | Workers 免费额度足够个人项目使用 |

核心代码不到 100 行，但解决了一个困扰很多出海项目的经典问题。

---

## 参考链接

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [request.cf 对象说明](https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [中国大陆网络访问优化指南](/posts/china-network-optimization-guide)

---

## 🌟 欢迎体验

如果你觉得这篇文章对你有帮助，欢迎访问我使用本方案优化后的视频网站：

<div align="center">

### 🎬 [star.divinations.top](https://star.divinations.top)

**高速流畅的在线视频播放体验**

</div>

本站使用上述方案进行了网络优化，大陆用户可以享受低延迟、高速度的访问体验，海外用户也能直连 Cloudflare 边缘节点。快来试试吧！ 🚀
