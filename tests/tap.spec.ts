#!/usr/bin/env -S node -r ts-node/register
import { test } from "tstest";

import * as WECHATY from "wechaty";

test("smoke testing", async t => {
  const bot = WECHATY.WechatyBuilder.build();

  t.ok(bot, "bot has created");
});
