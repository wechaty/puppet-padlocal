import { prepareSignedOnPuppet } from "./puppet-padlocal-common";

test("logout", async () => {
  const puppet = await prepareSignedOnPuppet();

  expect(puppet.logonoff()).toBeTruthy();

  await new Promise((resolve) => setTimeout(resolve, 2000));

  await puppet.logout();

  expect(puppet.logonoff()).toBeFalsy();
});

test("login", async () => {
  const puppet = await prepareSignedOnPuppet();

  expect(puppet.logonoff()).toBeTruthy();

  await new Promise((resolve) => setTimeout(resolve, 2000));

  await puppet.stop();

  expect(puppet.logonoff()).toBeFalsy();
}, 300000); // 5 min
