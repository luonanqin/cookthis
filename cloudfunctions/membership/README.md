# 云函数 `membership`

状态 / 建单 / 发货 / 刷新。授会员**只**走服务端 `fulfillPaidOrder`（支付推送或 `refresh` 查单），前端 `wx.requestVirtualPayment` success **不写**会员。

## 本地单测

仓库根目录：

```bash
node --test cloudfunctions/membership/*.test.js
```

不依赖 `wx-server-sdk`；`queryOrder` 目前 stub 为 `null`。

## 运维（未在本任务上传）

1. 微信公众平台开通虚拟支付；配置 **6 个**道具（首购 / 页价分开，各绑固定标价）：
   - `vip_month_first` ¥0.99、`vip_month` ¥6.6
   - `vip_quarter_first` ¥9.9、`vip_quarter` ¥16.6
   - `vip_year_first` ¥39.9、`vip_year` ¥56.6
   下单按是否首购选对应 `productId`，`goodsPrice` 与道具标价一致。
2. **防重复下单**：同一 `uid+sku` 只保留一笔 `created`；连点/重试复用原单并重签；价档变化或并发多插时关掉多余单（`closedReason: SUPERSEDED`）。云库建议复合索引：`uid` + `sku` + `status` + `createdAt`。
2. 云开发控制台创建并上传云函数 `membership`（本目录；勿依赖 `../_shared`，helpers 已 vendored）。
3. 云函数环境变量：
   - `XPAY_OFFER_ID` — 支付基础配置 offerId
   - `XPAY_APP_KEY` — 对应环境 AppKey（签名）
   - `XPAY_ENV` — `0` 正式 / `1` 沙箱
   - `MEMBERSHIP_ALLOW_DEV_GRANT` — 仅开发环境设为 `1`，否则 `devGrant` 返回 `FORBIDDEN`
4. 云开发「消息推送」：事件 `xpay_goods_deliver_notify` → 云函数 `membership`。推送入口必须回 `{ ErrCode: 0, ErrMsg: "success" }`。
5. 数据库集合：`memberships`（每 uid 一条当前态）、`membership_orders`。
6. 缺密钥时 `createOrder` 返回 `{ ok: false, error: "PAY_NOT_CONFIGURED" }`，不写订单。

## 手测

对照 `docs/superpowers/specs/2026-11-17-会员开通与权益-design.md` §12。2026-11-18 只登记了清单，**未**在微信开发者工具执行，条目保持未勾选。`queryOrder` 为 stub 时，延迟到账靠发货推送，不单靠刷新。
)