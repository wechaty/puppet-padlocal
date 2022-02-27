/* eslint-disable promise/always-return */
/* eslint-disable no-case-declarations */
/* eslint-disable import/first */

import * as PUPPET from "wechaty-puppet";
import { Contact, log, Message, ScanStatus, WechatyBuilder } from "wechaty";
import PuppetPadlocal from "../src/puppet-padlocal";
import config from "config";
import QRCode from "qrcode-terminal";
import { isContactId } from "../src/padlocal/utils/is-type";

// log.level("silly");

const token: string = config.get("padLocal.token");
const puppet = new PuppetPadlocal({ token });

async function getMessagePayload(message: Message) {
  const recallUserId: string = config.get("test.push.recallUserId");

  switch (message.type()) {
    case PUPPET.types.Message.Text:
      if (message.talker().id === recallUserId && message.text()!.indexOf("recall") !== -1) {
        await message.recall();
      }
      break;

    case PUPPET.types.Message.Attachment:
    case PUPPET.types.Message.Audio:
      const attachFile = await message.toFileBox();

      const dataBuffer = await attachFile.toBuffer();

      log.info("TestBot", `get message audio or attach: ${dataBuffer.length}`);

      break;

    case PUPPET.types.Message.Video:
      const videoFile = await message.toFileBox();

      const videoData = await videoFile.toBuffer();

      log.info("TestBot", `get message video: ${videoData.length}`);

      break;

    case PUPPET.types.Message.Emoticon:
      const emotionFile = await message.toFileBox();

      const emotionJSON = emotionFile.toJSON();
      log.info("TestBot", `get message emotion json: ${JSON.stringify(emotionJSON)}`);

      const emotionBuffer: Buffer = await emotionFile.toBuffer();

      log.info("TestBot", `get message emotion: ${emotionBuffer.length}`);

      break;

    case PUPPET.types.Message.Image:
      const messageImage = await message.toImage();

      const thumbImage = await messageImage.thumbnail();
      const thumbImageData = await thumbImage.toBuffer();

      log.info("TestBot", `get message image, thumb: ${thumbImageData.length}`);

      const hdImage = await messageImage.hd();
      const hdImageData = await hdImage.toBuffer();

      log.info("TestBot", `get message image, hd: ${hdImageData.length}`);

      const artworkImage = await messageImage.artwork();
      const artworkImageData = await artworkImage.toBuffer();

      log.info("TestBot", `get message image, artwork: ${artworkImageData.length}`);

      break;

    case PUPPET.types.Message.Url:
      const urlLink = await message.toUrlLink();
      log.info("TestBot", `get message url: ${JSON.stringify(urlLink)}`);

      const urlThumbImage = await message.toFileBox();
      const urlThumbImageData = await urlThumbImage.toBuffer();

      log.info("TestBot", `get message url thumb: ${urlThumbImageData.length}`);

      break;

    case PUPPET.types.Message.MiniProgram:
      const miniProgram = await message.toMiniProgram();

      log.info(`MiniProgramPayload: ${JSON.stringify(miniProgram)}`);

      break;
  }
}

const bot = WechatyBuilder.build({
  name: "TestBot",
  puppet,
});

bot
  .on("scan", (qrcode: string, status: ScanStatus) => {
    if (status === ScanStatus.Waiting && qrcode) {
      log.info(
        "TestBot",
        `onScan: ${ScanStatus[status]}(${status})\n\n ▼▼▼ Please scan following qr code to login ▼▼▼\n`
      );

      QRCode.generate(qrcode, { small: true });
    } else {
      log.info("TestBot", `onScan: ${ScanStatus[status]}(${status})`);
    }
  })

  .on("login", (user: Contact) => {
    log.info("TestBot", `${user} login`);
  })

  .on("logout", (user, reason) => {
    log.info("TestBot", `${user} logout, reason: ${reason}`);
  })

  .on("message", async (message: Message) => {
    log.info("TestBot", `on message: ${message.toString()}`);

    const forwardFrom = config.get("test.push.forwardFrom");
    const forwardTo: string = config.get("test.push.forwardTo");

    if (message.type() === PUPPET.types.Message.Text) {
      // ding-dong bot
      if (message.to()?.self() && message.text().indexOf("ding") !== -1) {
        await message.talker().say(message.text().replace("ding", "dong"));
      }
    }

    if (message.talker().id === forwardFrom) {
      if (message.type() === PUPPET.types.Message.Unknown) {
        return;
      }

      try {
        let to;
        if (isContactId(forwardTo)) {
          to = await bot.Contact.find({ id: forwardTo });
        } else {
          to = await bot.Room.find({ id: forwardTo });
        }
        const newMessage = await message.forward(to!);
        await getMessagePayload(newMessage as Message);
      } catch (e) {
        log.error("TestBot", `Error while forwarding message: ${(e as Error).stack}`);
      }
    }

    await getMessagePayload(message);
  })

  .on("error", (error) => {
    log.info("TestBot", `on error: ${error.toString()}`);
  });

bot
  .start()
  .then(() => {
    log.info("TestBot", "started.");
  })
  .catch(console.error);
