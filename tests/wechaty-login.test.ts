import { prepareSingedOnBot } from "./wechaty-common.js";

test("login", async() => {
  const bot = await prepareSingedOnBot();

  expect(bot.isLoggedIn).toBeTruthy();

  await new Promise((resolve) => setTimeout(resolve, 2000));

  await bot.stop();

  expect(bot.isLoggedIn).toBeFalsy();
}, 300000); // 5 min

test(
  "logout",
  async() => {
    const bot = await prepareSingedOnBot();

    expect(bot.isLoggedIn).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 2000));

    await bot.logout();

    expect(bot.isLoggedIn).toBeFalsy();
  },
  60 * 1000,
);
