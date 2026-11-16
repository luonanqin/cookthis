# userNo 老用户回填（一次性）

给尚无合法 `userNo` 的 `users` 按创建顺序赋连续序号，并把 `counters/userNo.value` 推到最终 max。

**禁止**在生产对已有合法 `userNo` 重排、改号或填缝。脚本只给缺失/非法值赋号；已有正整数一律跳过。

生产库执行是**人工延后步骤**，本仓库工作区不会对生产跑 `--apply`。

## 算法

1. 分页拉全量 `users`，过滤尚无合法 `userNo` 的（`Number.isInteger(n) && n >= 1`）。
2. 已有合法号求出 `maxExisting`。
3. 待填列表按 `createdAt` 升序，同毫秒按 `uid` 字符串升序。
4. 从 `max(maxExisting, counters.value) + 1` 起连续赋号；写完后把 `counters.userNo.value` 设为最终 max（无人待填时也把计数器抬到 `maxExisting`）。
5. 幂等：已有合法号跳过。中断后可再跑，已写入的用户不会被改号。

先写用户、再写计数器，避免预占号后中断留下空洞。

## 前置

- 云函数 `auth` 已部署（新用户走 `allocateUserNo`，计数器集合 `counters` / 文档 `userNo` / 字段 `value`）。
- 回填前不要靠 login 给老用户抢号。
- 本机不要把 `TCB_SECRET_*` 写进仓库或提交。

## Dry-run（默认，无写入）

### 方式 A：控制台导出 JSON（无云 SDK 也可）

云开发控制台 → 数据库 → `users` 导出 JSON。可选同时看 `counters/userNo.value`。

```bash
# 数组，或 { "users": [...], "counterValue": 12 }
node scripts/backfill-user-no.js --users-json /tmp/users.json
node scripts/backfill-user-no.js --users-json /tmp/users.json --counter 12
```

核对报告：`pending` / `skipped` / `nextCounter`、`assign uid userNo` 行。已有号必须出现在 skipped，不得出现在 assign。若出现 `duplicate existing userNo`，**停止**，先人工处理重复，禁止 `--apply`。

### 方式 B：直连云库（可选依赖）

```bash
npm i @cloudbase/node-sdk
TCB_ENV=<env> TCB_SECRET_ID=<id> TCB_SECRET_KEY=<key> node scripts/backfill-user-no.js
```

仍是 dry-run，除非加上 `--apply`。

## 测试环境 apply

先在测试环境 dry-run，再：

```bash
TCB_ENV=<test-env> TCB_SECRET_ID=<id> TCB_SECRET_KEY=<key> \
  node scripts/backfill-user-no.js --apply
```

`--apply` 必须读线上数据，不能和 `--users-json` 一起用（防止对过期 dump 写库）。

核对：

- 每个用户至多一个合法 `userNo`，无重复。
- 老用户号按 `createdAt` / `uid` 顺序连续接在 `max(maxExisting, counter)` 之后。
- `counters/userNo.value` 等于全表 max。
- 已有号与回填前一致。

## 生产 apply（人工）

1. 再跑一次 **dry-run**，保存报告。
2. 低峰执行 `--apply`（密钥只放环境变量）。
3. 再 dry-run：`pending: 0`，`nextCounter` 与 max 一致。
4. 抽查若干老用户 `createdAt` 与号的先后。

单测不替代生产核对：`node --test scripts/backfill-user-no.test.js`
