import { createPuppet } from "./common";
import { Contact, log, Message, Wechaty } from "wechaty";
import { ScanStatus } from "wechaty-puppet";
import { generate } from "qrcode-terminal";

test(
  "wechaty",
  async () => {
    const puppet = createPuppet();

    const bot = new Wechaty({
      name: "ding-dong-bot",
      puppet,
    });

    bot.on("scan", (qrcode: string, status: ScanStatus) => {
      if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
        generate(qrcode, { small: true }); // show qrcode on console

        const qrcodeImageUrl = ["https://wechaty.js.org/qrcode/", encodeURIComponent(qrcode)].join("");

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

    bot.on("message", async (msg: Message) => {
      log.info("TestBot", msg.toString());

      if (msg.text() === "ding") {
        await msg.say("dong");
      }
    });

    bot
      .start()
      .then(() => log.info("TestBot", "Starter Bot Started."))
      .catch((e) => log.error("TestBot", e));

    // tslint:disable-next-line:no-empty
    return new Promise(() => {});
  },
  Math.pow(2, 20)
);
