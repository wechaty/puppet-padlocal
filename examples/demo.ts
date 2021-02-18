// read config from local-test.json
process.env.NODE_CONFIG_ENV = "test";

import { Contact, Message, ScanStatus, Wechaty, log } from "wechaty";
import PuppetPadlocal from "../src/puppet-padlocal";
import config from "config";

const token: string = config.get("padLocal.token");
const puppet = new PuppetPadlocal({ token });

const bot = new Wechaty({
  name: "TestBot",
  puppet,
})

  .on("scan", (qrcode: string, status: ScanStatus) => {
    if (status === ScanStatus.Waiting && qrcode) {
      const qrcodeImageUrl = ["https://api.qrserver.com/v1/create-qr-code/?data=", encodeURIComponent(qrcode)].join("");
      log.info("TestBot", `onScan: ${ScanStatus[status]}(${status}) - ${qrcodeImageUrl}`);
    } else {
      log.info("TestBot", `onScan: ${ScanStatus[status]}(${status})`);
    }
  })

  .on("login", (user: Contact) => {
    log.info("TestBot", `${user} login`);
  })

  .on("logout", (user: Contact, reason: string) => {
    log.info("TestBot", `${user} logout, reason: ${reason}`);
  })

  .on("message", async (message: Message) => {
    log.info("TestBot", `on message: ${message.toString()}`);
  })

  .on("error", (error) => {
    log.info("TestBot", `on error: ${error.toString()}`);
  });

bot.start().then(() => {
  log.info("TestBot", "started.");
});
