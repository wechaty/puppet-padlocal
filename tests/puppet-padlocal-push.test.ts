import { LOGPRE, prepareSignedOnPuppet } from "./puppet-padlocal-common";
import { FriendshipPayload, ImageType, MessageType, Puppet, RoomInvitationPayload, log } from "wechaty-puppet";
import { FileBoxJsonObjectUrl } from "file-box/src/file-box.type";
import { MessagePayload } from "wechaty-puppet/src/schemas/message";
import config from "config";

test(
  "push",
  async () => {
    const forwardFrom: string = config.get("test.push.forwardFrom");
    const forwardTo: string = config.get("test.push.forwardTo");
    const recallUserId: string = config.get("test.push.recallUserId");

    const forwardMessage = async (puppet: Puppet, message: MessagePayload): Promise<void> => {
      if (message.type === MessageType.Unknown) {
        return;
      }

      try {
        await puppet.messageForward(forwardTo, message.id);
      } catch (e) {
        log.error(LOGPRE, `Error while forwarding message: ${e.stack}`);
      }
    };

    const getMessagePayload = async (puppet: Puppet, messageId: string, message: MessagePayload) => {
      switch (message.type) {
        case MessageType.Text:
          if (message.fromId === recallUserId && message.text!.indexOf("recall") !== -1) {
            await puppet.messageRecall(messageId);
          }
          break;

        case MessageType.Attachment:
        case MessageType.Audio:
          const attachFile = await puppet.messageFile(messageId);
          expect(attachFile).toBeTruthy();

          const dataBuffer = await attachFile.toBuffer();
          expect(dataBuffer.length).toBeGreaterThan(0);
          break;

        case MessageType.Video:
          const videoFile = await puppet.messageFile(messageId);
          expect(videoFile).toBeTruthy();

          const videoData = await videoFile.toBuffer();
          expect(videoData.length).toBeGreaterThan(0);

          break;

        case MessageType.Emoticon:
          const emotionFile = await puppet.messageFile(messageId);
          expect(emotionFile).toBeTruthy();

          const emotionJSON = emotionFile.toJSON() as FileBoxJsonObjectUrl;
          expect(emotionJSON.remoteUrl.length).toBeGreaterThan(0);

          break;

        case MessageType.Image:
          const thumbImage = await puppet.messageImage(messageId, ImageType.Thumbnail);
          expect(thumbImage).toBeTruthy();

          const thumbImageData = await thumbImage.toBuffer();
          expect(thumbImageData.length).toBeGreaterThan(0);

          const hdImage = await puppet.messageImage(messageId, ImageType.HD);
          expect(hdImage).toBeTruthy();

          const hdImageData = await hdImage.toBuffer();
          expect(hdImageData.length).toBeGreaterThan(0);

          expect(thumbImageData.length).toBeLessThan(hdImageData.length);

          break;

        case MessageType.Url:
          const urlPayload = await puppet.messageUrl(messageId);
          expect(urlPayload).toBeTruthy();
          expect(urlPayload.title).toBeTruthy();
          expect(urlPayload.url).toBeTruthy();

          const urlThumb = await puppet.messageFile(messageId);
          expect(urlThumb).toBeTruthy();

          const urlThumbData = await urlThumb.toBuffer();
          expect(urlThumbData.length).toBeGreaterThan(0);
          break;

        case MessageType.MiniProgram:
          const miniProgramPayload = await puppet.messageMiniProgram(messageId);
          expect(miniProgramPayload);

          expect(miniProgramPayload.appid?.length).toBeGreaterThan(0);
          expect(miniProgramPayload.description?.length).toBeGreaterThan(0);
          expect(miniProgramPayload.pagePath?.length).toBeGreaterThan(0);
          expect(miniProgramPayload.iconUrl?.length).toBeGreaterThan(0);
          expect(miniProgramPayload.thumbUrl?.length).toBeGreaterThan(0);
          expect(miniProgramPayload.title?.length).toBeGreaterThan(0);
          expect(miniProgramPayload.username?.length).toBeGreaterThan(0);
          expect(miniProgramPayload.thumbKey?.length).toBeGreaterThan(0);

          break;
      }
    };

    await prepareSignedOnPuppet(async (puppet) => {
      puppet.on("message", async (payload) => {
        const messageId = payload.messageId;
        const message = await puppet.messagePayload(messageId);

        if (message.fromId === forwardFrom && message.toId === forwardFrom) {
          log.info(LOGPRE, `forward message: ${JSON.stringify(message)}`);

          await forwardMessage(puppet, message);
          return;
        } else if (message.fromId === forwardFrom && message.roomId === forwardTo) {
          if (message.type === MessageType.MiniProgram) {
            const miniProgramPayload = await puppet.messageMiniProgram(messageId);
            await puppet.messageSendMiniProgram(forwardFrom, miniProgramPayload);
          }
        }

        log.info(LOGPRE, `on message: ${JSON.stringify(message)}`);

        await getMessagePayload(puppet, messageId, message);
      });

      puppet.on("friendship", async (payload) => {
        const friendship: FriendshipPayload = await puppet.friendshipPayload(payload.friendshipId);
        log.info(LOGPRE, `on friendship: ${JSON.stringify(friendship)}`);
      });

      puppet.on("room-invite", async (payload) => {
        const roomInvitation: RoomInvitationPayload = await puppet.roomInvitationPayload(payload.roomInvitationId);
        log.info(LOGPRE, `on room invite: ${JSON.stringify(roomInvitation)}`);
      });

      puppet.on("room-join", async (payload) => {
        log.info(LOGPRE, `on room join: ${JSON.stringify(payload)}`);
      });

      puppet.on("room-leave", async (payload) => {
        log.info(LOGPRE, `on room leave: ${JSON.stringify(payload)}`);
      });

      puppet.on("room-topic", async (payload) => {
        log.info(LOGPRE, `on room topic: ${JSON.stringify(payload)}`);
      });
    });

    // tslint:disable-next-line:no-empty
    return new Promise(() => {});
  },
  Math.pow(2, 30)
);
