---
title: OCI 大阪 A1 实例刷容量完整实战教程
description: 本教程基于一次真实完整排障与实战刷机过程整理，目标是最终刷到一台 Osaka 的 A1 ARM 实例。
date: 2025-12-21T00:00:00+08:00
tags:
  - OCI
  - Oracle Cloud
  - VPS
  - Tutorial
---

> **适用对象**
> - Region：ap-osaka-1（大阪）
> - Shape：VM.Standard.A1.Flex（ARM / aarch64）
> - 免费层 / 新租户
> - Console 长期提示 **Out of host capacity**

这篇文章基于一次**完整真实排障 + 最终进入“稳定刷库存阶段”**的过程整理，融合了：

- 参数校验
- ARM 镜像选择
- 错误分类
- 指数退避 + 抖动
- CLI / 云机环境迁移

目标只有一个：

> ✅ **把问题从“为什么失败”推进到“只剩库存因素”**

---

## 一、核心结论（先看这个）

1. **Osaka A1 失败 ≠ 配置问题**
   - 绝大多数情况是：**宿主机没库存**
2. **Console 基本无解**
   - 实操层面只能靠 **OCI CLI + 脚本轮询**
3. **只要看到 `Out of host capacity`**
   - 往往说明你已经 **配置正确**
   - 剩下的就是等 Oracle 放出碎片资源

---

## 二、整体刷机思路（理解很重要）

### Osaka 的真实情况

- 只有 **1 个 AD**
- A1 是真实物理 ARM 宿主机切片
- Free Tier / 普通用户本质是在抢“别人释放的空位”

### 成功的必要条件

- CLI 认证 100% 正确
- 所有 OCID **必须属于 ap-osaka-1**
- 镜像必须是 **ARM / aarch64**
- 节奏要慢（避免 API 限流 / 风控）

---

## 三、环境准备（云机 or 本地都可）

下面以 Ubuntu 为例（在云机上跑更稳定，也更方便长期后台挂脚本）。

### 1️⃣ 安装 OCI CLI

```bash
sudo apt update
sudo apt install -y python3 python3-pip curl unzip
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"
source ~/.bashrc
oci -v
```

---

## 四、OCI CLI 认证（关键步骤）

确保你已经完成：

- `~/.oci/config`
- `~/.oci/oci_api_key.pem`
- 公钥已上传到 OCI Console → User → API Keys

验证：

```bash
oci iam availability-domain list
```

Osaka 正常通常只会看到：

```text
cQAx:AP-OSAKA-1-AD-1
```

---

## 五、必须准备的 3 个 OCID（100% 来自 Osaka）

### 1️⃣ COMPARTMENT_ID

```bash
oci iam compartment list --compartment-id-in-subtree true --all
```

一般使用：

- `name = root` 对应的 id
- 或你自建的 compartment

---

### 2️⃣ SUBNET_ID（Osaka 子网）

要求：

- Region：ap-osaka-1
- 推荐：Default Subnet (Regional)

校验：

```bash
oci network subnet get --subnet-id <SUBNET_ID>
```

---

### 3️⃣ IMAGE_ID（必须是 ARM / aarch64）

最常见踩坑：**拿了 x86 镜像去建 A1（ARM）**。

用 CLI 直接筛选 A1 可用的 ARM 镜像（示例为 Oracle Linux 9）：

```bash
oci compute image list \
  --compartment-id <COMPARTMENT_ID> \
  --shape VM.Standard.A1.Flex \
  --operating-system "Oracle Linux" \
  --operating-system-version "9" \
  --all \
  --output table
```

推荐优先选最新的 `aarch64`：

```text
Oracle-Linux-9.x-aarch64-YYYY.MM.DD-0
```

---

## 六、最终刷机脚本（优化版 · 推荐）

### 📄 `oci-osaka-a1-single-ad.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# ===== 必填（替换成你自己的）=====
COMPARTMENT_ID="ocid1.compartment.oc1..xxxxxxxx"
SUBNET_ID="ocid1.subnet.oc1.ap-osaka-1.xxxxxxxx"
IMAGE_ID="ocid1.image.oc1.ap-osaka-1.xxxxxxxx"   # ARM / aarch64

# ===== Osaka 通常只有一个 AD =====
AD_NAME="cQAx:AP-OSAKA-1-AD-1"

# ===== A1 配置（成功率常见更高）=====
SHAPE="VM.Standard.A1.Flex"
OCPUS=1
MEMORY=6

# ===== 退避策略 =====
BASE_SLEEP=60
MAX_SLEEP=$((20*60))
JITTER_MAX=30
DEBUG="${DEBUG:-0}"

log() { echo "[$(date '+%F %T')] $*"; }

classify_error() {
  local out="$1"
  if echo "$out" | grep -qi "Out of host capacity"; then
    echo "NO_CAPACITY（区域/AD 没库存）"; return
  fi
  if echo "$out" | grep -qiE "Quota|LimitExceeded"; then
    echo "QUOTA_OR_LIMIT（配额/免费额度）"; return
  fi
  if echo "$out" | grep -qi "InvalidParameter"; then
    echo "INVALID_PARAM（参数错误）"; return
  fi
  echo "OTHER"
}

sleep_with_backoff() {
  local base="$1"
  local jitter=$((RANDOM % (JITTER_MAX + 1)))
  local total=$((base + jitter))
  log "sleep ${total}s"
  sleep "$total"
}

log "Start hunting Osaka A1..."
sleep_sec="$BASE_SLEEP"

while true; do
  DISPLAY_NAME="osaka-a1-$(date +%Y%m%d-%H%M%S)"
  log "Try $AD_NAME name=$DISPLAY_NAME ocpu=$OCPUS mem=${MEMORY}G"

  set +e
  OUT="$(oci compute instance launch \
    --availability-domain "$AD_NAME" \
    --compartment-id "$COMPARTMENT_ID" \
    --shape "$SHAPE" \
    --display-name "$DISPLAY_NAME" \
    --subnet-id "$SUBNET_ID" \
    --image-id "$IMAGE_ID" \
    --assign-public-ip true \
    --shape-config "{\"ocpus\":$OCPUS,\"memoryInGBs\":$MEMORY}" \
    2>&1)"
  RESULT=$?
  set -e

  if [ "$RESULT" -eq 0 ]; then
    log "SUCCESS!"
    exit 0
  fi

  REASON="$(classify_error "$OUT")"
  log "FAILED: $REASON"
  [ "$DEBUG" -eq 1 ] && echo "$OUT"

  sleep_with_backoff "$sleep_sec"
  sleep_sec=$((sleep_sec * 2))
  [ "$sleep_sec" -gt "$MAX_SLEEP" ] && sleep_sec="$MAX_SLEEP"
done
```

---

## 七、运行与后台常驻

```bash
chmod +x oci-osaka-a1-single-ad.sh
DEBUG=1 nohup ./oci-osaka-a1-single-ad.sh > oci-hunt.log 2>&1 &
tail -f oci-hunt.log
```

看到以下日志说明一切正常（你已经进入“只剩库存因素”的阶段）：

```text
FAILED: NO_CAPACITY（区域/AD 没库存）
```

---

## 八、现实预期（非常重要）

- 成功时间：**10 分钟 ~ 数小时（甚至更久）**
- 常见放量时间：UTC 夜间 / 日本下午-晚上
- 长时间 `NO_CAPACITY` 完全正常

---

## 九、成功后注意事项

- 不要立刻 Stop / Terminate
- 先 SSH 登录一次
- 跑点真实负载，避免被回收

---

## 十、一句话总结

> **大阪 A1 不是“创建”，而是“等待 + 抢占”**
> 你看到 `Out of host capacity`，就说明方向基本对了。
