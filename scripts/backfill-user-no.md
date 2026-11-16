# userNo 老用户回填（一次性）

给尚无合法 `userNo` 的 `users` 按创建顺序赋连续序号，并把 `counters/userNo.value` 推到最终 max。

**禁止**在生产对已有合法 `userNo` 重排、改号或填缝。脚本只给缺失/非法值赋号；已有正整数一律跳过。

生产库执行是**人工延后步骤**，本仓库工作区不会对生产跑 `--apply`。

## 算法

1. 分页拉全量 `users`，过滤尚无合法 `userNo` 的（`Number.isInteger(n) && n >= 1`）。
2. 已有合法号求出 `maxExisting`。
3. 待填列表按 `createdAt` 升序，同毫秒按 `uid` 字符串升序。
4. 从 `max(maxExisting, counters.value) + 1` 起连续赋号；把 `counters.userNo.value` 抬到最终 max（无人待填时也抬到 `maxExisting`）。
5. 幂等：已有合法号跳过。中断后可再跑，已写入的用户不会被改号。再跑可能留下空洞（号不连续），只保证不重复，不要靠回填填缝。

`--apply` 先对计数器做读改写：live 值必须仍等于规划时读到的值，否则中止；**禁止把计数器改小**。预占成功后再写用户，且只在库里仍是非法 `userNo` 时才写入。因此与线上 `allocateUserNo` 并发时宁可中止重跑，也不抢号、不回拨。预占后中断会留下空洞，这是可接受的。

## 前置

- 云函数 `auth` 已部署（新用户走 `allocateUserNo`，计数器集合 `counters` / 文档 `userNo` / 字段 `value`）。
- 回填前不要靠 login 给老用户抢号。
- 本机不要把 `TCB_SECRET_*` 写进仓库或提交。

## Dry-run（默认，无写入）

### 方式 A：控制台导出 JSON（无云 SDK 也可）

云开发控制台 → 数据库 → `users` 导出 JSON。可选同时看 `counters/userNo.value`。

```bash
# 支持：JSON 数组、{ "users": [...], "counterValue": 12 }、
# 云开发控制台导出的 NDJSON（一行一条文档）、单个用户对象
node scripts/backfill-user-no.js --users-json /tmp/users.json
node scripts/backfill-user-no.js --users-json /tmp/users.json --counter 12
```

控制台「导出」若是**每行一个 `{...}`**（不是外层 `[...]`），脚本已兼容，无需手工改成数组。

`--counter` 只用于 dump dry-run，用来覆盖 dump 里的计数器；**禁止**和 `--apply` 一起用。

核对报告：`pending` / `skipped` / `nextCounter`、`assign uid userNo` 与 `skip uid userNo` 行。已有号必须出现在 skip，不得出现在 assign。若出现 `duplicate existing userNo`，**停止**，先人工处理重复，禁止 `--apply`。

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

`--apply` 必须读线上数据，不能和 `--users-json` 或 `--counter` 一起用（防止对过期 dump / 手填计数器写库）。成功写入后才会打印 apply 报告。

核对：

- 每个用户至多一个合法 `userNo`，无重复。
- 老用户号按 `createdAt` / `uid` 顺序接在规划时的 `max(maxExisting, counter)` 之后；再跑允许空洞。
- `counters/userNo.value` ≥ 全表 max，且从未被脚本改小。
- 已有合法号与回填前一致。
- 若报 `counter moved`：放弃本次 apply，重新 dry-run 再执行。

## 生产 apply（人工）

1. 再跑一次 **dry-run**，保存报告。
2. 低峰执行 `--apply`（密钥只放环境变量）。
3. 再 dry-run：`pending: 0`，`nextCounter` 与 max 一致。
4. 抽查若干老用户 `createdAt` 与号的先后。

单测不替代生产核对：`node --test scripts/backfill-user-no.test.js`
