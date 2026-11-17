# 云函数 `membership`

状态 / 建单 / 发货 / 刷新。授会员**只**走服务端 `fulfillPaidOrder`（支付推送或 `refresh` 查单），前端 `wx.requestVirtualPayment` success **不写**会员。

## 本地单测

仓库根目录：

```bash
node --test cloudfunctions/membership/*.test.js
```

不依赖 `wx-server-sdk`；`queryOrder` 目前 stub 为 `null`。

## 运维（未在本任务上传）

1. 微信公众平台开通虚拟支付；配置月/季/年道具 `productId`（默认 `vip_month` / `vip_quarter` / `vip_year`）与页价（分）。
2. 云开发控制台创建并上传云函数 `membership`（本目录；勿依赖 `../_shared`，helpers 已 vendored）。
3. 云函数环境变量：
   - `XPAY_OFFER_ID` — 支付基础配置 offerId
   - `XPAY_APP_KEY` — 对应环境 AppKey（签名）
   - `XPAY_ENV` — `0` 正式 / `1` 沙箱
   - `MEMBERSHIP_ALLOW_DEV_GRANT` — 仅开发环境设为 `1`，否则 `devGrant` 返回 `FORBIDDEN`
4. 云开发「消息推送」：事件 `xpay_goods_deliver_notify` → 云函数 `membership`。推送入口必须回 `{ ErrCode: 0, ErrMsg: "success" }`。
5. 数据库集合：`memberships`（每 uid 一条当前态）、`membership_orders`。
6. 缺密钥时 `createOrder` 返回 `{ ok: false, error: "PAY_NOT_CONFIGURED" }`，不写订单。
)