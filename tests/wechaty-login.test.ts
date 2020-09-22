import { prepareSingedOnBot } from "./wechaty-common";

test("login", async () => {
  const bot = await prepareSingedOnBot();

  expect(bot.logonoff()).toBeTruthy();

  await new Promise((resolve) => setTimeout(resolve, 2000));

  await bot.stop();

  expect(bot.logonoff()).toBeFalsy();
}, 300000); // 5 min

test("logout", async () => {
  const bot = await prepareSingedOnBot();

  expect(bot.logonoff()).toBeTruthy();

  await new Promise((resolve) => setTimeout(resolve, 2000));

  await bot.logout();

  expect(bot.logonoff()).toBeFalsy();
});
