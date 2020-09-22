import { Contact, log, Wechaty } from "wechaty";
import { ScanStatus } from "wechaty-puppet";
import { createPuppet } from "./puppet-padlocal-common";

export function createBot(): Wechaty {
  const puppet = createPuppet();

  return new Wechaty({
    name: "TestBot",
    puppet,
  });
}

type PrepareBotFunc = (bot: Wechaty) => Promise<void>;

export async function prepareSingedOnBot(prepareBotFunc?: PrepareBotFunc): Promise<Wechaty> {
  const bot = createBot();

  bot.on("scan", (qrcode: string, status: ScanStatus) => {
    if (status === ScanStatus.Waiting && qrcode) {
      const qrcodeImageUrl = ["https://api.qrserver.com/v1/create-qr-code/?data=", encodeURIComponent(qrcode)].join("");
      log.info("TestBot", "onScan: %s(%s) - %s", ScanStatus[status], status, qrcodeImageUrl);
    } else {
      log.info("TestBot", "onScan: %s(%s)", ScanStatus[status], status);
    }
  });

  bot.on("login", (user: Contact) => {
    log.info("TestBot", "%s login", user);
  });

  bot.on("logout", (user: Contact) => {
    log.info("TestBot", "%s logout", user);
  });

  await bot.start();

  log.info("TestBot", "TestBot started.");

  await prepareBotFunc?.(bot);

  await bot.ready();

  log.info("TestBot", "TestBot ready.");

  return bot;
}
