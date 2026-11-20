# 云函数 `membership`

状态 / 建单 / 发货 / 刷新。授会员**只**走服务端 `fulfillPaidOrder`（支付推送或 `refresh` 查单），前端 `wx.requestVirtualPayment` success **不写**会员。

## 本地单测

仓库根目录：

```bash
node --test cloudfunctions/membership/*.test.js
```

不依赖真实微信网络；`queryOrder` 通过注入 `getAccessToken` / `postJson` 单测。现网走 `POST /xpay/query_order`（`pay_sig` + access_token）。

## 运维（未在本任务上传）

1. 微信公众平台开通虚拟支付；配置 **6 个**道具（首购 / 页价分开，各绑固定标价）：
   - `vip_month_first` ¥0.99、`vip_month` ¥6.6
   - `vip_quarter_first` ¥9.9、`vip_quarter` ¥16.6
   - `vip_year_first` ¥39.9、`vip_year` ¥56.6
   下单按是否首购选对应 `productId`，`goodsPrice` 与道具标价一致。
2. **防重复下单**：全局仅 1 笔有效未支付；同档复用并重签；异档需 `replacePending`。云库索引见根目录 README **Slice 18 准备 §B.2**（精简：必建 `uid+createdAt DESC`；未支付等值查 + 内存排序，**不**建 createdAt ASC/DESC 双索引）。
3. 云开发控制台创建并上传云函数 `membership`（本目录；勿依赖 `../_shared`，helpers 已 vendored）。云函数需开通「开放接口」权限以便取 access_token。
4. 云函数环境变量：
   - `XPAY_OFFER_ID` — 支付基础配置 offerId
   - `XPAY_APP_KEY` — 对应环境 AppKey（签名）
   - `XPAY_ENV` — `0` 正式 / `1` 沙箱（现网支付 `signData.env` 用正式填 `0`）
   - （`main` 无调试 action。）联调 `dev*` / `MEMBERSHIP_ALLOW_DEV_GRANT` 仅在 **`develop`** 分支；正式云不要设该变量为 `1`。见 [`doc/分支与发布约定.md`](../../doc/分支与发布约定.md)。
5. 云开发「消息推送」：事件 `xpay_goods_deliver_notify` → 云函数 `membership`。推送入口必须回 `{ ErrCode: 0, ErrMsg: "success" }`。发货幂等键：`OutTradeNo` CAS + `wxOrderId`（`WeChatPayInfo.MchOrderNo`）。
6. 数据库集合：`memberships`（每 uid 一条当前态）、`membership_orders`。
7. 缺密钥时 `createOrder` 返回 `{ ok: false, error: "PAY_NOT_CONFIGURED" }`，不写订单。
8. iOS：MP 配置小程序简称并开通苹果 IAP；客户端要求微信 ≥ 8.0.68。

## 前端总开关

小程序 `MEMBERSHIP_ENABLED`（`miniprogram/services/membership.js`）：`false` 时隐藏所有会员入口/页；广告不受影响。说明见根目录 README **Slice 18 · 会员功能总开关**与 [`doc/分支与发布约定.md`](../../doc/分支与发布约定.md)。联调可为 `true`；上线前若暂不卖会员改回 `false`。

## 手测

主清单在仓库根目录 [`README.md`](../../README.md) **Slice 18 准备**与**本切片验收清单（Slice 18）**（你要准备什么、测什么都写在那里）。  
设计验收对照 [`docs/superpowers/specs/2026-11-17-会员开通与权益-design.md`](../../docs/superpowers/specs/2026-11-17-会员开通与权益-design.md) §12；平台侧另可对照官方个人主体虚拟支付「部署前检查清单」。
