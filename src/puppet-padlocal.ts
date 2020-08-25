import {
  ContactPayload,
  EventRoomJoinPayload,
  EventRoomLeavePayload,
  EventRoomTopicPayload,
  FileBox,
  FriendshipPayload,
  FriendshipPayloadReceive,
  ImageType,
  log,
  MessagePayload,
  MessageType,
  MiniProgramPayload,
  Puppet,
  PuppetOptions,
  RoomInvitationPayload,
  RoomMemberPayload,
  RoomPayload,
  ScanStatus,
  UrlLinkPayload,
} from "wechaty-puppet";

import { KickOutEvent, PadLocalClient } from "padlocal-client-ts";
import {
  AppMessageLink,
  AppMessageMiniProgram,
  ChatRoomMember,
  Contact,
  ImageType as PadLocalImageType,
  Label,
  LoginPolicy,
  LoginType,
  Message,
  QRCodeEvent,
  QRCodeStatus,
  SendTextMessageResponse,
  SyncEvent,
} from "padlocal-client-ts/dist/proto/padlocal_pb";
import { genIdempotentId } from "padlocal-client-ts/dist/utils/Utils";
import { CacheManager, RoomMemberMap } from "./padlocal/cache-manager";
import { isRoomId } from "./padlocal/utils/is-type";
import {
  padLocalContactToWechaty,
  padLocalMessageToWechaty,
  padLocalRoomMemberToWechaty,
  padLocalRoomToWechaty,
} from "./padlocal/schema-mapper";
import { appMessageParser } from "./padlocal/message-parser/helpers/message-appmsg";
import { miniProgramMessageParser } from "./padlocal/message-parser/helpers/message-miniprogram";
import { parseMessage } from "./padlocal/message-parser";
import { MessageCategory } from "./padlocal/message-parser/message-parser-type";
import { emotionPayloadParser } from "./padlocal/message-parser/helpers/message-emotion";
import { WechatMessageType } from "wechaty-puppet/dist/src/schemas/message";

export type PuppetPadlocalOptions = PuppetOptions & {};

const PRE = "[PuppetPadlocal]";

const logLevel = process.env.PADLOCAL_LOG || process.env.WECHATY_LOG;
if (logLevel) {
  log.level(logLevel.toLowerCase() as any);
  log.silly(PRE, "set level to %s", logLevel);
} else {
  // set default log level
  log.level("verbose");
}

class PuppetPadlocal extends Puppet {
  private readonly _client: PadLocalClient;
  private _cacheMgr?: CacheManager;

  constructor(public options: PuppetPadlocalOptions = {}) {
    super(options);

    this._client = new PadLocalClient(options.endpoint!, options.token!);

    this._client.on("kickout", async (_detail: KickOutEvent) => {
      this.emit("logout", { contactId: this.id!, data: JSON.stringify(_detail) });

      await this.stop();
    });

    this._client.on("message", async (messageList: Message[]) => {
      for (const message of messageList) {
        // handle message one by one
        await this._onPushMessage(message);
      }
    });

    this._client.on("contact", async (contactList: Contact[]) => {
      for (const contact of contactList) {
        await this._onPushContact(contact);
      }
    });
  }

  public async start(): Promise<void> {
    if (this.state.on()) {
      log.warn(PRE, "start() is called on a ON puppet. await ready(on) and return.");
      await this.state.ready("on");
      return;
    }

    this.state.on("pending");

    const ScanStatusName = {
      [ScanStatus.Unknown]: "Unknown",
      [ScanStatus.Cancel]: "Cancel",
      [ScanStatus.Waiting]: "Waiting",
      [ScanStatus.Scanned]: "Scanned",
      [ScanStatus.Confirmed]: "Confirmed",
      [ScanStatus.Timeout]: "Timeout",
    };

    const onQrCodeEvent = async (qrCodeEvent: QRCodeEvent) => {
      let scanStatus: ScanStatus = ScanStatus.Unknown;
      let qrCodeImageURL: string | undefined;
      switch (qrCodeEvent.getStatus()) {
        case QRCodeStatus.NEW:
          qrCodeImageURL = qrCodeEvent.getImageurl();
          scanStatus = ScanStatus.Waiting;
          break;
        case QRCodeStatus.SCANNED:
          scanStatus = ScanStatus.Scanned;
          break;
        case QRCodeStatus.CONFIRMED:
          scanStatus = ScanStatus.Confirmed;
          break;
        case QRCodeStatus.CANCELLED:
          scanStatus = ScanStatus.Cancel;
          break;
        case QRCodeStatus.EXPIRED:
          scanStatus = ScanStatus.Timeout;
          break;
      }

      log.verbose(
        PRE,
        `scan event, status: ${ScanStatusName[scanStatus]}${qrCodeImageURL ? ", with qrcode: " + qrCodeImageURL : ""}`
      );

      this.emit("scan", {
        qrcode: qrCodeImageURL,
        status: scanStatus,
      });
    };

    const LoginTypeName = {
      [LoginType.QRLOGIN]: "QrLogin",
      [LoginType.AUTOLOGIN]: "AutoLogin",
      [LoginType.ONECLICKLOGIN]: "OneClickLogin",
    };

    this._client.api
      .login(LoginPolicy.DEFAULT, {
        onLoginStart: (loginType: LoginType) => {
          log.verbose(PRE, `start login with type: ${LoginTypeName[loginType]}`);
        },

        onOneClickEvent: onQrCodeEvent,

        onQrCodeEvent,

        onLoginSuccess: async (_) => {
          const userName = this._client.selfContact!.getUsername();
          log.verbose(PRE, `login success: ${userName}`);

          await this.login(this._client.selfContact!.getUsername());
        },

        // Will sync message and contact after login success, since last time login.
        onSync: (syncEvent: SyncEvent) => {
          log.verbose(PRE, `login sync event: ${JSON.stringify(syncEvent.toObject())}`);

          for (const contact of syncEvent.getContactList()) {
            this._onPushContact(contact);
          }

          for (const message of syncEvent.getMessageList()) {
            this._onPushMessage(message);
          }
        },
      })
      .then(() => {
        log.verbose(PRE, `on ready`);

        this.emit("ready", {
          data: "ready",
        });

        this.state.on(true);
      })
      .catch((e) => {
        log.error(PRE, "login failed", e);

        this.emit("error", { data: e.toString() });

        this.stop();
      });
  }

  /**
   * called internally while login success
   * @param userId
   * @protected
   */
  protected async login(userId: string): Promise<void> {
    await super.login(userId);

    this._cacheMgr = new CacheManager(userId);
    await this._cacheMgr.init();

    const oldContact = await this._cacheMgr!.getContact(this.id!);
    if (!oldContact) {
      await this._cacheMgr!.setContact(this.id!, this._client.selfContact!.toObject());
    }
  }

  /**
   * stop the bot, with account signed on, will try auto login next time bot start.
   */
  public async stop(): Promise<void> {
    if (this.state.off()) {
      log.warn(PRE, "stop() is called on a OFF puppet. await ready(off) and return.");
      await this.state.ready("off");
      return;
    }

    this.state.off("pending");

    this._client.shutdown();
    this.id = undefined;

    await this._cacheMgr!.close();
    this._cacheMgr = undefined;

    this.state.off(true);
  }

  /**
   * logout account and stop the bot
   */
  public async logout(): Promise<void> {
    if (!this.id) {
      throw new Error("logout before login?");
    }

    await this._client.api.logout();

    this.emit("logout", { contactId: this.id, data: "logout by self" });

    await this.stop();
  }

  ding(_data?: string): void {
    this.emit("dong", { data: "Everything is ok" });
  }

  /****************************************************************************
   * contact
   ***************************************************************************/

  // @ts-ignore
  public async contactSelfName(name: string): Promise<void> {
    await this._client.api.updateSelfNickName(name);
  }

  public async contactSelfQRCode(): Promise<string> {
    const response = await this._client.api.getContactQRCode(this._client.selfContact!.getUsername(), 1);

    const fileBox = FileBox.fromBuffer(Buffer.from(response.getQrcode()), `qr-${this.id}.jpg`);
    return fileBox.toQRCode();
  }

  // @ts-ignore
  public async contactSelfSignature(signature: string): Promise<void> {
    await this._client.api.updateSelfSignature(signature);
  }

  public contactAlias(contactId: string): Promise<string>;
  public contactAlias(contactId: string, alias: string | null): Promise<void>;
  // @ts-ignore
  public async contactAlias(contactId: string, alias?: string | null): Promise<void | string> {
    await this._client.api.updateContactRemark(contactId, alias || "");
  }

  public async contactAvatar(contactId: string): Promise<FileBox>;
  public async contactAvatar(contactId: string, file: FileBox): Promise<void>;
  public async contactAvatar(contactId: string, file?: FileBox): Promise<void | FileBox> {
    if (file) {
      throw new Error(`set avatar is not unsupported`);
    }

    const contact = await this.contactRawPayload(contactId);
    return FileBox.fromUrl(contact.avatar, `avatar-${contactId}.jpg`);
  }

  public async contactList(): Promise<string[]> {
    return this._cacheMgr!.getContactIds();
  }

  /****************************************************************************
   * tag
   ***************************************************************************/

  public async tagContactAdd(tagName: string, contactId: string): Promise<void> {
    const label = (await this._findTagWithName(tagName, true))!;

    const contact = await this.contactRawPayload(contactId);
    const contactLabelIds = contact.label
      .split(",")
      .filter((l) => l)
      .map((l) => parseInt(l, 10));
    if (contactLabelIds.indexOf(label.getId()) !== -1) {
      throw new Error(`contact: ${contactId} has already assigned tag: ${tagName}`);
    }

    contactLabelIds.push(label.getId());
    await this._client.api.setContactLabel(contactId, contactLabelIds);

    contact.label = contactLabelIds.join(",");
    await this._updateContactCache(contact);
  }

  public async tagContactRemove(tagName: string, contactId: string): Promise<void> {
    const label = await this._findTagWithName(tagName);
    if (!label) {
      throw new Error(`can not find tag with name: ${tagName}`);
    }

    const contact = await this.contactRawPayload(contactId);
    const contactLabelIds = contact.label
      .split(",")
      .filter((l) => l)
      .map((l) => parseInt(l, 10));
    const labelIndex = contactLabelIds.indexOf(label.getId());
    if (labelIndex === -1) {
      log.warn(PRE, `contact: ${contactId} has no tag: ${tagName}`);
      return;
    }

    contactLabelIds.splice(labelIndex, 1);
    await this._client.api.setContactLabel(contactId, contactLabelIds);

    contact.label = contactLabelIds.join(",");
    await this._updateContactCache(contact);
  }

  public async tagContactDelete(tagName: string): Promise<void> {
    const label = (await this._findTagWithName(tagName, false))!;
    if (!label) {
      throw new Error(`tag:${tagName} doesn't exist`);
    }

    await this._client.api.removeLabel(label.getId());

    // refresh label list
    await this._getTagList(true);
  }

  public async tagContactList(contactId?: string): Promise<string[]> {
    // the all tag
    if (!contactId) {
      const { labelList } = await this._getTagList(true);
      return labelList.map((l) => l.getName());
    } else {
      const contact = await this.contactRawPayload(contactId);
      if (!contact.label || !contact.label.length) {
        return [];
      }

      const contactLabelIds: number[] = contact.label
        .split(",")
        .filter((l) => l)
        .map((l) => parseInt(l, 10));

      const { labelList, fromCache } = await this._getTagList();
      let contactLabelList = labelList.filter((l) => contactLabelIds.indexOf(l.getId()) !== -1);
      if (contactLabelList.length === contactLabelIds.length || !fromCache) {
        return contactLabelList.map((l) => l.getName());
      }

      // cached label list is out of date
      const newLabelList = (await this._getTagList(true)).labelList;
      contactLabelList = newLabelList.filter((l) => contactLabelIds.indexOf(l.getId()) !== -1);
      return contactLabelList.map((l) => l.getName());
    }
  }

  /****************************************************************************
   * friendship
   ***************************************************************************/

  public async friendshipAccept(friendshipId: string): Promise<void> {
    const friendship: FriendshipPayloadReceive = (await this.friendshipRawPayload(
      friendshipId
    )) as FriendshipPayloadReceive;
    await this._client.api.acceptUser(friendship.stranger!, friendship.ticket);
  }

  public async friendshipAdd(contactId: string, hello: string): Promise<void> {
    const res = await this._client.api.searchContact(contactId);

    if (!res.getAntispamticket()) {
      throw new Error(`contact:${contactId} is already a friend`);
    }

    await this._client.api.addContact(res.getEncryptusername()!, res.getAntispamticket()!, res.getToaddscene(), hello);
  }

  public async friendshipSearchPhone(phone: string): Promise<null | string> {
    return this.friendshipSearchWeixin(phone);
  }

  public async friendshipSearchWeixin(weixin: string): Promise<null | string> {
    const res = await this._client.api.searchContact(weixin);

    const contact = res.getContact()!;

    const oldContact = await this._cacheMgr!.getContact(weixin);
    if (!oldContact) {
      contact.setUsername(weixin);
      await this._cacheMgr!.setContact(weixin, contact.toObject());
    }

    return weixin;
  }

  /****************************************************************************
   * get message payload
   ***************************************************************************/

  public async messageContact(_messageId: string): Promise<string> {
    throw new Error(`not implement`);
  }

  public async messageFile(messageId: string): Promise<FileBox> {
    const messagePayload: Message.AsObject = await this.messageRawPayload(messageId);
    const message: MessagePayload = await this.messageRawPayloadParser(messagePayload);

    switch (message.type) {
      case MessageType.Audio:
        let audioData: Buffer;
        if (messagePayload.binarypayload && messagePayload.binarypayload.length) {
          audioData = Buffer.from(messagePayload.binarypayload);
        } else {
          audioData = await this._client.api.getMessageVoice(messageId, message.text!, message.toId!);
        }
        const audioFileBox = FileBox.fromBuffer(audioData, `message-${messageId}-audio.slk`);
        audioFileBox.mimeType = "audio/silk";
        return audioFileBox;

      case MessageType.Video:
        const videoData = await this._client.api.getMessageVideo(message.text!, message.toId!);
        const videoFileBox = FileBox.fromBuffer(videoData, `message-${messageId}-video.mp4`);
        videoFileBox.mimeType = "video/mp4";
        return videoFileBox;

      case MessageType.Attachment:
        const appMsg = await appMessageParser(messagePayload);
        const fileData = await this._client.api.getMessageAttach(message.text!, message.toId!);
        const binaryFileBox = FileBox.fromBuffer(fileData, appMsg.title);
        binaryFileBox.mimeType = "application/octet-stream";
        return binaryFileBox;

      default:
        throw new Error(`Can not get file for message: ${messageId}`);
    }
  }

  public async messageImage(messageId: string, imageType: ImageType): Promise<FileBox> {
    const messagePayload: Message.AsObject = await this.messageRawPayload(messageId);
    const message: MessagePayload = await this.messageRawPayloadParser(messagePayload);

    let retFileBox: FileBox;

    switch (message.type) {
      case MessageType.Image:
        if (imageType === ImageType.Thumbnail) {
          if (messagePayload.binarypayload && messagePayload.binarypayload.length) {
            const imageData = Buffer.from(messagePayload.binarypayload);
            return FileBox.fromBuffer(imageData, `message-${messageId}-image-thumb.jpg`);
          }
        }

        let pbImageType: PadLocalImageType;
        if (imageType === ImageType.Thumbnail) {
          pbImageType = PadLocalImageType.THUMB;
        } else if (imageType === ImageType.HD) {
          pbImageType = PadLocalImageType.HD;
        } else {
          pbImageType = PadLocalImageType.NORMAL;
        }
        const ret = await this._client.api.getMessageImage(
          messagePayload.content,
          messagePayload.tousername,
          pbImageType
        );

        let imageNameSuffix: string;
        if (ret.imageType === PadLocalImageType.THUMB) {
          imageNameSuffix = "thumb";
        } else if (ret.imageType === PadLocalImageType.HD) {
          imageNameSuffix = "hd";
        } else {
          imageNameSuffix = "normal";
        }

        retFileBox = FileBox.fromBuffer(ret.imageData, `message-${messageId}-image-${imageNameSuffix}.jpg`);

        break;

      case MessageType.Emoticon:
        const emotionPayload = await emotionPayloadParser(messagePayload);
        retFileBox = FileBox.fromUrl(emotionPayload.cdnurl, `message-${messageId}-emotion.jpg`);

        break;

      case MessageType.Video:
        const videoThumbData = await this._client.api.getMessageVideoThumb(
          messagePayload.content,
          messagePayload.tousername
        );
        retFileBox = FileBox.fromBuffer(videoThumbData, `message-${messageId}-video-thumb.jpg`);

        break;

      case MessageType.Url:
        const appPayload = await appMessageParser(messagePayload);

        if (appPayload.thumburl) {
          retFileBox = FileBox.fromUrl(appPayload.thumburl);
        } else {
          const urlThumbData = await this._client.api.getMessageAttachThumb(
            messagePayload.content,
            messagePayload.tousername
          );
          retFileBox = FileBox.fromBuffer(urlThumbData, `message-${messageId}-url-thumb.jpg`);
        }

        break;

      default:
        throw new Error(`Can not get image for message: ${messageId}`);
    }

    if (!retFileBox.mimeType) {
      retFileBox.mimeType = "image/jpeg";
    }

    return retFileBox;
  }

  public async messageMiniProgram(messageId: string): Promise<MiniProgramPayload> {
    const messagePayload = await this.messageRawPayload(messageId);
    const message = await this.messageRawPayloadParser(messagePayload);

    if (message.type !== MessageType.MiniProgram) {
      throw new Error(`message is not mini program, can not get MiniProgramPayload`);
    }

    return miniProgramMessageParser(messagePayload);
  }

  public async messageUrl(messageId: string): Promise<UrlLinkPayload> {
    const rawPayload = await this.messageRawPayload(messageId);
    const payload = await this.messageRawPayloadParser(rawPayload);

    if (payload.type !== MessageType.Url) {
      throw new Error("Can not get url from non url payload");
    }

    const appPayload = await appMessageParser(rawPayload);
    return {
      description: appPayload.des,
      thumbnailUrl: appPayload.thumburl,
      title: appPayload.title,
      url: appPayload.url,
    };
  }

  /****************************************************************************
   * send message
   ***************************************************************************/

  // @ts-ignore
  public async messageSendContact(toUserName: string, contactId: string): Promise<void> {
    // TODO: send contact
  }

  // @ts-ignore
  public async messageSendFile(toUserName: string, file: FileBox): Promise<void | string> {
    // image/jpeg, image/png
    if (file.mimeType?.startsWith("image/")) {
      const imageData = await file.toBuffer();
      const response = await this._client.api.sendImageMessage(genIdempotentId(), toUserName, imageData);

      const pushContent = isRoomId(toUserName) ? `${this._client.selfContact!.getNickname()}: [图片]` : "[图片]";

      await this._onSendMessage(
        new Message()
          .setType(WechatMessageType.Image)
          .setFromusername(this.id!)
          .setTousername(toUserName)
          .setBinarypayload(imageData)
          .setPushcontent(pushContent),
        response.getMsgid(),
        response.getClientmsgid(),
        response.getNewclientmsgid(),
        response.getCreatetime()
      );
    }

    // audio/silk
    else if (file.mimeType?.startsWith("audio/")) {
      // TODO: send audio
    }

    // video/mp4
    else if (file.mimeType?.startsWith("video/")) {
      // TODO: send video
    }

    // try to send any other type as binary file
    // application/octet-stream
    else {
      // TODO: send binary file
    }
  }

  public async messageSendMiniProgram(toUserName: string, mpPayload: MiniProgramPayload): Promise<void> {
    const miniProgram = new AppMessageMiniProgram();
    mpPayload.appid && miniProgram.setMpappid(mpPayload.appid);
    mpPayload.description && miniProgram.setDescription(mpPayload.description);
    mpPayload.pagePath && miniProgram.setMpapppath(mpPayload.pagePath);
    mpPayload.iconUrl && miniProgram.setMpappiconurl(mpPayload.iconUrl);
    mpPayload.title && miniProgram.setTitle(mpPayload.title);
    mpPayload.username && miniProgram.setMpappusername(mpPayload.username);

    if (mpPayload.thumbUrl) {
      const thumb = await FileBox.fromUrl(mpPayload.thumbUrl).toBuffer();
      miniProgram.setThumbimage(thumb);
    }

    await this._client.api.sendAppMessageMiniProgram(genIdempotentId(), toUserName, miniProgram);
  }

  public async messageSendText(toUserName: string, text: string): Promise<string> {
    const response: SendTextMessageResponse = await this._client.api.sendTextMessage(
      genIdempotentId(),
      toUserName,
      text
    );

    const pushContent = isRoomId(toUserName) ? `${this._client.selfContact!.getNickname()}: ${text}` : text;

    await this._onSendMessage(
      new Message()
        .setType(WechatMessageType.Text)
        .setFromusername(this.id!)
        .setTousername(toUserName)
        .setContent(text)
        .setPushcontent(pushContent),
      response.getMsgid(),
      response.getClientmsgid(),
      response.getNewclientmsgid(),
      response.getCreatetime()
    );

    return response.getMsgid();
  }

  public async messageSendUrl(conversationId: string, linkPayload: UrlLinkPayload): Promise<void> {
    const appMessageLink = new AppMessageLink();

    appMessageLink.setTitle(linkPayload.title).setUrl(linkPayload.url);
    linkPayload.description && appMessageLink.setDescription(linkPayload.description);

    if (linkPayload.thumbnailUrl) {
      const thumb = await FileBox.fromUrl(linkPayload.thumbnailUrl).toBuffer();
      appMessageLink.setThumbimage(thumb);
    }

    await this._client.api.sendAppMessageLink(genIdempotentId(), conversationId, appMessageLink);
  }

  // @ts-ignore
  public async messageRecall(messageId: string): Promise<boolean> {
    const message = (await this._cacheMgr!.getMessage(messageId))!;

    const messageSend = (await this._cacheMgr!.getMessageSendResult(messageId))!;
    await this._client.api.revokeMessage(
      messageId,
      messageSend.clientMsgId,
      messageSend.newClientMsgId,
      messageSend.createTime,
      message.fromusername,
      message.tousername
    );
  }

  public async messageForward(toUserName: string, messageId: string): Promise<void> {
    const messagePayload = await this.messageRawPayload(messageId);
    const message = await this.messageRawPayloadParser(messagePayload);

    switch (message.type) {
      case MessageType.Text:
        await this.messageSendText(toUserName, message.text!);
        break;

      case MessageType.Image:
      case MessageType.Audio:
      case MessageType.Video:
      case MessageType.Attachment:
      case MessageType.Emoticon:
      case MessageType.MiniProgram:
      case MessageType.Url:
      case MessageType.Contact:
        // TODO: implement more message type forwarding
        await this._client.api.forwardMessage(
          genIdempotentId(),
          toUserName,
          messagePayload.content,
          messagePayload.type,
          messagePayload.tousername
        );
        break;

      default:
        throw new Error(`Message forwarding is unsupported for messageId:${messageId}, type:${message.type}`);
    }
  }

  /****************************************************************************
   * room
   ***************************************************************************/

  public async roomAdd(roomId: string, contactId: string): Promise<void> {
    await this._client.api.addChatRoomMember(roomId, contactId);
  }

  public async roomAvatar(roomId: string): Promise<FileBox> {
    const chatroom = await this.roomRawPayload(roomId);
    return FileBox.fromUrl(chatroom.avatar || "");
  }

  public async roomCreate(contactIdList: string[], topic?: string): Promise<string> {
    const res = await this._client.api.createChatRoom(genIdempotentId(), contactIdList);

    if (topic) {
      await this._client.api.setChatRoomName(res.getRoomid(), topic);
    }

    return res.getRoomid();
  }

  public async roomDel(roomId: string, contactId: string): Promise<void> {
    await this._client.api.deleteChatRoomMember(roomId, contactId);
  }

  public async roomList(): Promise<string[]> {
    return this._cacheMgr!.getRoomIds();
  }

  public async roomQRCode(roomId: string): Promise<string> {
    const res = await this._client.api.getChatRoomQrCode(roomId);

    const fileBox = FileBox.fromBuffer(Buffer.from(res.getQrcode()), `qr-${this.id}.jpg`);
    return fileBox.toQRCode();
  }

  // @ts-ignore
  public async roomQuit(roomId: string): Promise<void> {
    // TODO:
  }

  public async roomTopic(roomId: string): Promise<string>;
  public async roomTopic(roomId: string, topic: string): Promise<void>;
  public async roomTopic(roomId: string, topic?: string): Promise<void | string> {
    await this._client.api.setChatRoomName(roomId, topic || "");
  }

  public async roomAnnounce(roomId: string): Promise<string>;
  public async roomAnnounce(roomId: string, text: string): Promise<void>;
  public async roomAnnounce(roomId: string, text?: string): Promise<void | string> {
    await this._client.api.setChatRoomAnnouncement(roomId, text || "");
  }

  public async roomMemberList(roomId: string): Promise<string[]> {
    const roomMemberMap = await this._getRoomMemberList(roomId);
    return Object.values(roomMemberMap).map((m) => m.username);
  }

  // @ts-ignore
  public async roomInvitationAccept(roomInvitationId: string): Promise<void> {
    // const roomInvitation = await this.roomInvitationRawPayload(roomInvitationId);
    // TODO:
  }

  /****************************************************************************
   * RawPayload section
   ***************************************************************************/

  public async contactRawPayloadParser(payload: Contact.AsObject): Promise<ContactPayload> {
    return padLocalContactToWechaty(payload);
  }

  public async contactRawPayload(id: string): Promise<Contact.AsObject> {
    let ret = await this._cacheMgr!.getContact(id);

    if (!ret) {
      const contact = await this._client.api.getContact(id);
      await this._saveContactCache(contact);
      ret = contact.toObject();
    }

    return ret;
  }

  public async messageRawPayloadParser(payload: Message.AsObject): Promise<MessagePayload> {
    return padLocalMessageToWechaty(payload);
  }

  public async messageRawPayload(id: string): Promise<Message.AsObject> {
    const ret = await this._cacheMgr!.getMessage(id);

    if (!ret) {
      throw new Error(`can not find message in cache for messageId: ${id}`);
    }

    return ret;
  }

  public async roomRawPayloadParser(payload: Contact.AsObject): Promise<RoomPayload> {
    return padLocalRoomToWechaty(payload);
  }

  public async roomRawPayload(id: string): Promise<Contact.AsObject> {
    let ret = await this._cacheMgr!.getRoom(id);

    if (!ret) {
      const contact = await this._client.api.getContact(id);
      await this._saveContactCache(contact);
      ret = contact.toObject();
    }

    return ret;
  }

  public async roomMemberRawPayload(roomId: string, contactId: string): Promise<ChatRoomMember.AsObject> {
    const roomMemberMap = await this._getRoomMemberList(roomId);
    return roomMemberMap[contactId];
  }

  public async roomMemberRawPayloadParser(rawPayload: ChatRoomMember.AsObject): Promise<RoomMemberPayload> {
    return padLocalRoomMemberToWechaty(rawPayload);
  }

  public async roomInvitationRawPayload(roomInvitationId: string): Promise<RoomInvitationPayload> {
    const ret = await this._cacheMgr!.getRoomInvitation(roomInvitationId);

    if (!ret) {
      throw new Error(`Can not find room invitation for id: ${roomInvitationId}`);
    }

    return ret;
  }

  public async roomInvitationRawPayloadParser(rawPayload: RoomInvitationPayload): Promise<RoomInvitationPayload> {
    return rawPayload;
  }

  public async friendshipRawPayload(id: string): Promise<FriendshipPayload> {
    const ret = await this._cacheMgr!.getFriendshipRawPayload(id);

    if (!ret) {
      throw new Error(`Can not find friendship for id: ${id}`);
    }

    return ret;
  }

  public async friendshipRawPayloadParser(rawPayload: FriendshipPayload): Promise<FriendshipPayload> {
    return rawPayload;
  }

  /****************************************************************************
   * private section
   ***************************************************************************/

  private async _findTagWithName(tagName: string, addIfNotExist?: boolean): Promise<Label | null> {
    let labelList = (await this._getTagList()).labelList;
    let ret = labelList.find((l) => l.getName() === tagName);
    if (!ret) {
      // try refresh label list if not find by name
      labelList = (await this._getTagList(true)).labelList;
      ret = labelList.find((l) => l.getName() === tagName);
    }

    // add new label
    if (!ret && addIfNotExist) {
      const newLabelId = await this._client.api.addLabel(tagName);
      ret = new Label().setId(newLabelId).setName(tagName);

      // refresh label list;
      await this._getTagList(true);
    }

    return ret || null;
  }

  private async _getTagList(force?: boolean): Promise<{ labelList: Label[]; fromCache: boolean }> {
    let labelList = this._cacheMgr!.getLabelList();
    let fromCache = true;

    if (!labelList || force) {
      labelList = await this._client.api.getLabelList();
      this._cacheMgr?.setLabelList(labelList);
      fromCache = false;
    }

    return {
      labelList,
      fromCache,
    };
  }

  private async _updateContactCache(contact: Contact.AsObject) {
    await this._cacheMgr!.setContact(contact.username, contact);
    await this.contactPayloadDirty(contact.username);
  }

  private async _getRoomMemberList(roomId: string, force?: boolean): Promise<RoomMemberMap> {
    let ret = await this._cacheMgr!.getRoomMember(roomId);
    if (!ret || force) {
      const resMembers = await this._client.api.getChatRoomMembers(roomId);

      const roomMemberMap: RoomMemberMap = {};
      resMembers.forEach((m) => {
        roomMemberMap[m.getUsername()] = m.toObject();
      });

      ret = roomMemberMap;

      await this._cacheMgr!.setRoomMember(roomId, roomMemberMap);
    }

    return ret;
  }

  private async _saveContactCache(contact: Contact): Promise<void> {
    if (isRoomId(contact.getUsername())) {
      const roomId = contact.getUsername();
      await this._cacheMgr!.setRoom(roomId, contact.toObject());
      await this._cacheMgr!.deleteRoomMember(roomId);
      await this.roomPayloadDirty(roomId);
    } else {
      await this._cacheMgr!.setContact(contact.getUsername(), contact.toObject());
      await this.contactPayloadDirty(contact.getUsername());
    }
  }

  private async _onPushContact(contact: Contact): Promise<void> {
    log.verbose(PRE, `on push contact: ${JSON.stringify(contact.toObject())}`);
    return this._saveContactCache(contact);
  }

  private async _onPushMessage(message: Message): Promise<void> {
    const messageId = message.getId();

    log.info(PRE, `on push original message: ${JSON.stringify(message.toObject())}`);
    log.info(PRE, Buffer.from(message.serializeBinary()).toString("hex"));

    // filter out duplicated messages
    if (await this._cacheMgr!.hasMessage(messageId)) {
      return;
    }

    const messageObj: Message.AsObject = message.toObject();
    await this._cacheMgr!.setMessage(message.getId(), messageObj);

    const parseRet = await parseMessage(this, messageObj);

    switch (parseRet.category) {
      case MessageCategory.NormalMessage:
        this.emit("message", {
          messageId,
        });
        break;

      case MessageCategory.Friendship:
        const friendship: FriendshipPayload = parseRet.payload;
        await this._cacheMgr!.setFriendshipRawPayload(messageId, friendship);
        this.emit("friendship", {
          friendshipId: messageId,
        });
        break;

      case MessageCategory.RoomInvite:
        const roomInvite: RoomInvitationPayload = parseRet.payload;
        await this._cacheMgr!.setRoomInvitation(messageId, roomInvite);

        this.emit("room-invite", {
          roomInvitationId: messageId,
        });
        break;

      case MessageCategory.RoomJoin:
        const roomJoin: EventRoomJoinPayload = parseRet.payload;
        this.emit("room-join", roomJoin);

        await this._cacheMgr!.deleteRoomMember(roomJoin.roomId);
        break;

      case MessageCategory.RoomLeave:
        const roomLeave: EventRoomLeavePayload = parseRet.payload;
        this.emit("room-leave", roomLeave);

        await this._cacheMgr!.deleteRoomMember(roomLeave.roomId);
        break;

      case MessageCategory.RoomTopic:
        const roomTopic: EventRoomTopicPayload = parseRet.payload;
        this.emit("room-topic", roomTopic);
    }
  }

  private async _onSendMessage(
    partialMessage: Message,
    messageId: string,
    clientMsgId: string,
    newClientMsgId: string,
    createTime: number
  ) {
    partialMessage.setId(messageId);
    partialMessage.setCreatetime(createTime);

    await this._cacheMgr!.setMessage(messageId, partialMessage.toObject());

    await this._cacheMgr!.setMessageSendResult(messageId, {
      clientMsgId,
      newClientMsgId,
      createTime,
    });
  }
}

export { PuppetPadlocal };
export default PuppetPadlocal;
