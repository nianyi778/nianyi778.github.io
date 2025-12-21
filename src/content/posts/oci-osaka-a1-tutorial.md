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

> 适用对象：
> - **ap-osaka-1（大阪）Region**
> - **ARM / VM.Standard.A1.Flex**
> - 免费层或新租户
> - Console 一直提示 **Out of host capacity**

本教程基于一次**真实完整排障与实战刷机过程**整理，目标是：

> ✅ **最终刷到一台 Osaka 的 A1 ARM 实例**

---

## 一、背景与核心结论

### 1️⃣ 为什么大阪创建实例总失败？

- Osaka 是 OCI **全球最拥挤的 Region 之一**
- ARM（A1）性价比极高，被大量脚本/用户长期占用
- Console 创建 **几乎不可能一次成功**

👉 **结论**：

> **大阪 ARM = 只能靠 CLI + 脚本刷，没有捷径**

---

## 二、整体思路（先理解，再操作）

### 刷大阪的本质

- 不是“配置问题”
- 而是：

> **在唯一的 AD 里，反复抢别人释放出来的物理宿主机**

### 成功条件

- CLI 认证必须 100% 正确
- 参数必须全部来自 **Osaka**
- 刷的节奏要安全（避免风控）

---

## 三、准备环境

### 1️⃣ 安装 Python 3（推荐 brew）

```bash
brew install python
python3 --version
```

要求：Python ≥ 3.8

---

### 2️⃣ 安装 OCI CLI（推荐 pip 方式）

```bash
python3 -m pip install --upgrade pip
python3 -m pip install oci-cli
```

验证：

```bash
oci -v
```

---

## 四、配置 OCI CLI 认证（最容易踩坑的部分）

执行：

```bash
oci setup config
```

### 正确填写示例

```text
Enter a location for your config:
→ 直接回车

Enter a user OCID:
→ ocid1.user.oc1..xxxxxx

Enter a tenancy OCID:
→ ocid1.tenancy.oc1..xxxxxx

Enter a region:
→ ap-osaka-1
```

⚠️ **常见错误（一定要避免）**

- ❌ 把 subnet / domain 当成 user OCID
- ❌ 把 subnet 当成 tenancy OCID

---

### 生成 API Key

```text
Generate a new API Signing RSA key pair? Y
```

生成后会得到：

- `~/.oci/oci_api_key.pem`
- `~/.oci/oci_api_key_public.pem`

---

### 上传公钥（必须做）

```bash
cat ~/.oci/oci_api_key_public.pem
```

复制全部内容，然后：

```
OCI Console → 右上角头像 → 用户设置 → API 密钥 → 添加 → 粘贴
```

---

### 验证是否成功

```bash
oci iam availability-domain list
```

成功示例：

```json
{
  "data": [
    {
      "name": "cQAx:AP-OSAKA-1-AD-1"
    }
  ]
}
```

> **说明**：
> - 大部分 Osaka 租户 **只会看到 1 个 AD**（这是正常的）

---

## 五、获取刷实例所需的 3 个关键参数

### 1️⃣ COMPARTMENT_ID（你新建的子区间）

路径：

```
OCI Console → 身份 → 区间 → 创建子区间
```

进入子区间后，复制：

```text
ocid1.compartment.oc1..xxxx
```

---

### 2️⃣ SUBNET_ID（Osaka 子网）

路径：

```
OCI Console → 网络 → 虚拟云网络 → Default VCN → 子网
```

推荐选择：

- `Default Subnet (Regional)`

复制：

```text
ocid1.subnet.oc1.ap-osaka-1.xxxx
```

---

### 3️⃣ IMAGE_ID（ARM 镜像，最容易拿错）

路径：

```
OCI Console → 计算 → 映像
```

要求：

- Region：Japan Central (Osaka)
- Publisher：Canonical
- Architecture：ARM / aarch64
- OS：Ubuntu 20.04 / 22.04

复制：

```text
ocid1.image.oc1.ap-osaka-1.xxxx
```

---

## 六、最终刷大阪 A1 的脚本

### 📄 oci-osaka-a1-single-ad.sh

```bash
#!/usr/bin/env bash

set -e

COMPARTMENT_ID="ocid1.compartment.oc1..xxxx"
SUBNET_ID="ocid1.subnet.oc1.ap-osaka-1.xxxx"
IMAGE_ID="ocid1.image.oc1.ap-osaka-1.xxxx"

AD_NAME="cQAx:AP-OSAKA-1-AD-1"

SHAPE="VM.Standard.A1.Flex"
OCPUS=1
MEMORY=6
DISPLAY_NAME="osaka-a1-$(date +%Y%m%d-%H%M%S)"

SLEEP_INTERVAL=60

echo "🔥 Start hunting Osaka A1 capacity..."

while true; do
  echo "⏳ Try launch at $(date)"

  set +e
  oci compute instance launch \
    --availability-domain "$AD_NAME" \
    --compartment-id "$COMPARTMENT_ID" \
    --shape "$SHAPE" \
    --display-name "$DISPLAY_NAME" \
    --subnet-id "$SUBNET_ID" \
    --image-id "$IMAGE_ID" \
    --assign-public-ip true \
    --shape-config "{\"ocpus\":$OCPUS,\"memoryInGBs\":$MEMORY}" \
    > /dev/null 2>&1

  RESULT=$?
  set -e

  if [ $RESULT -eq 0 ]; then
    echo "🎉 SUCCESS! Instance created!"
    exit 0
  else
    echo "❌ No capacity, sleep ${SLEEP_INTERVAL}s..."
    sleep $SLEEP_INTERVAL
  fi
done
```

---

## 七、进阶：成功后自动通知

如果你不想一直盯着日志，可以在脚本成功部分加入通知代码。

### 1️⃣ Telegram 通知（推荐）

你需要：
1.  在 Telegram 找 `@BotFather` 创建机器人，获取 `BOT_TOKEN`。
2.  找 `@userinfobot` 获取你的 `CHAT_ID`。

修改脚本中的成功判断部分：

```bash
  if [ $RESULT -eq 0 ]; then
    echo "🎉 SUCCESS! Instance created!"
    
    # Telegram 通知
    curl -s -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage" \
        -d chat_id="<YOUR_CHAT_ID>" \
        -d text="✅ OCI Osaka A1 实例创建成功！IP 请登录控制台查看。"

    exit 0
  else
```

### 2️⃣ 邮件通知（需要配置 mail 命令）

```bash
  if [ $RESULT -eq 0 ]; then
    echo "🎉 SUCCESS! Instance created!" | mail -s "OCI Instance Created" your-email@example.com
    exit 0
  fi
```

---

## 八、运行方式

```bash
chmod +x oci-osaka-a1-single-ad.sh
nohup ./oci-osaka-a1-single-ad.sh > osaka-hunt.log 2>&1 &
```

查看日志：

```bash
tail -f osaka-hunt.log
```

正常状态：

```text
❌ No capacity, sleep 60 sec...
```

成功状态：

```text
🎉 SUCCESS! Instance created!
```

---

## 九、现实预期（非常重要）

- ⏱ 常见成功时间：10 分钟 ~ 几小时
- 🕐 最容易成功：日本时间 **凌晨 1–6 点**
- ❗ 日志一直 No capacity 是 **正常现象**

---

## 十、成功后第一时间要做的事

1. Console → Compute → Instances
2. 记录公网 IP
3. SSH 登录确认
4. **不要立刻删除/停止实例**（避免容量回收）

---

## 十一、一句话总结

> **大阪 ARM 不是“创建”，而是“抢”**  
> 你跑着脚本，就已经在队列里了。

---

祝你成功刷到 Osaka A1 🎯
