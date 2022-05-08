import config from "config";
import { Contact, Friendship, log, Message, Room, RoomInvitation, Wechaty } from "wechaty";
import { prepareSingedOnBot } from "./wechaty-common.js";
import { isContactId } from "../src/padlocal/utils/is-type.js";
import * as PUPPET from "wechaty-puppet";

const LOGPRE = "TestBot";

test(
  "push",
  async() => {
    const forwardFrom = config.get("test.push.forwardFrom");
    const forwardTo: string = config.get("test.push.forwardTo");
    const recallUserId: string = config.get("test.push.recallUserId");

    const getMessagePayload = async(message: Message) => {
      switch (message.type()) {
        case PUPPET.types.Message.Text:
          if (message.talker().id === recallUserId && message.text()!.indexOf("recall") !== -1) {
            await message.recall();
          }
          break;

        case PUPPET.types.Message.Attachment:
        case PUPPET.types.Message.Audio: {
          const attachFile = await message.toFileBox();
          expect(attachFile).toBeTruthy();

          const dataBuffer = await attachFile.toBuffer();
          expect(dataBuffer.length).toBeGreaterThan(0);

          log.info(LOGPRE, `get message audio or attach: ${dataBuffer.length}`);

          break;
        }

        case PUPPET.types.Message.Video: {
          const videoFile = await message.toFileBox();
          expect(videoFile).toBeTruthy();

          const videoData = await videoFile.toBuffer();
          expect(videoData.length).toBeGreaterThan(0);

          log.info(LOGPRE, `get message video: ${videoData.length}`);

          break;
        }

        case PUPPET.types.Message.Emoticon: {
          const emotionFile = await message.toFileBox();
          expect(emotionFile).toBeTruthy();

          const emotionJSON = emotionFile.toJSON() as any;
          expect(emotionJSON.remoteUrl.length).toBeGreaterThan(0);

          const emotionBuffer: Buffer = await emotionFile.toBuffer();
          expect(emotionBuffer.length).toBeTruthy();

          log.info(LOGPRE, `get message emotion: ${emotionBuffer.length}`);

          break;
        }

        case PUPPET.types.Message.Image: {
          const messageImage = await message.toImage();
          expect(messageImage).toBeTruthy();

          const thumbImage = await messageImage.thumbnail();
          expect(thumbImage).toBeTruthy();
          const thumbImageData = await thumbImage.toBuffer();
          expect(thumbImageData.length).toBeTruthy();

          log.info(LOGPRE, `get message image, thumb: ${thumbImageData.length}`);

          const artworkImage = await messageImage.artwork();
          expect(artworkImage).toBeTruthy();
          const artworkImageData = await artworkImage.toBuffer();
          expect(artworkImageData.length).toBeTruthy();

          log.info(LOGPRE, `get message image, artwork: ${artworkImageData.length}`);

          const hdImage = await messageImage.hd();
          expect(hdImage).toBeTruthy();
          const hdImageData = await hdImage.toBuffer();
          expect(hdImageData.length).toBeTruthy();

          log.info(LOGPRE, `get message image, hd: ${hdImageData.length}`);

          break;
        }

        case PUPPET.types.Message.Url: {
          const urlLink = await message.toUrlLink();
          expect(urlLink).toBeTruthy();
          expect(urlLink.title()).toBeTruthy();
          expect(urlLink.url()).toBeTruthy();

          const urlThumbImage = await message.toFileBox();
          expect(urlThumbImage).toBeTruthy();
          const urlThumbImageData = await urlThumbImage.toBuffer();
          expect(urlThumbImageData.length).toBeTruthy();

          log.info(LOGPRE, `get message url thumb: ${urlThumbImageData.length}`);

          break;
        }

        case PUPPET.types.Message.MiniProgram: {
          const miniProgram = await message.toMiniProgram();

          log.info(`MiniProgramPayload: ${JSON.stringify(miniProgram)}`);

          expect(miniProgram).toBeTruthy();

          expect(miniProgram.appid()?.length).toBeGreaterThan(0);
          expect(miniProgram.description()?.length).toBeGreaterThan(0);
          expect(miniProgram.pagePath()?.length).toBeGreaterThan(0);
          // expect(miniProgram.iconUrl?.length).toBeGreaterThan(0);
          expect(miniProgram.thumbUrl()?.length).toBeGreaterThan(0);
          expect(miniProgram.title()?.length).toBeGreaterThan(0);
          expect(miniProgram.username()?.length).toBeGreaterThan(0);
          expect(miniProgram.thumbKey()?.length).toBeGreaterThan(0);

          break;
        }
      }
    };

    const forwardMessage = async(bot: Wechaty, message: Message): Promise<void> => {
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
        log.error(LOGPRE, `Error while forwarding message: ${(e as Error).stack}`);
      }
    };

    await prepareSingedOnBot(async(bot) => {
      bot.on("message", async(message: Message) => {
        log.info(LOGPRE, `on message: ${message.toString()}`);

        if (message.talker().id === forwardFrom && message.listener()?.id === forwardFrom) {
          await forwardMessage(bot, message);
        }

        await getMessagePayload(message);
      });

      bot.on("friendship", async(friendship: Friendship) => {
        log.info(LOGPRE, `on friendship: ${friendship.toJSON()}`);

        if (friendship.type() === PUPPET.types.Friendship.Receive) {
          try {
            log.info(LOGPRE, `receive friendship: ${friendship.toJSON()}`);

            await friendship.accept();

            log.info(LOGPRE, "accept success");
          } catch (e) {
            log.error(LOGPRE, `accept failed: ${(e as Error).stack}`);
          }
        }
      });

      bot.on("room-invite", async(roomInvite: RoomInvitation) => {
        log.info(LOGPRE, `on room invite: ${await roomInvite.toJSON()}`);

        await roomInvite.accept();
      });

      bot.on("room-join", async(room: Room, inviteeList: Contact[], inviter: Contact, date) => {
        log.info(
          LOGPRE,
          `on room join: ${room.toString()}, inviteeList: ${inviteeList.map((i) => i.id)}, inviter: ${
            inviter.id
          }, ${date}`,
        );
      });

      bot.on("room-leave", async(room: Room, leaverList: Contact[], remover?: Contact, date?: Date) => {
        log.info(
          LOGPRE,
          `on room leave: ${room.toString()}, leaverList: ${leaverList.map((l) => l.id)}, remover: ${
            remover?.id
          } ${date}`,
        );
      });

      bot.on("room-topic", async(room: Room, newTopic: string, oldTopic: string, changer: Contact, date?: Date) => {
        log.info(LOGPRE, `on room topic: ${room.toString()}, ${newTopic}, ${oldTopic}, ${changer.toString()}, ${date}`);
      });
    });

    // tslint:disable-next-line:no-empty
    return new Promise(() => {});
  },
  Math.pow(2, 30),
);
