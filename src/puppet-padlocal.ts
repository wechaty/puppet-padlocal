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
  PayloadType,
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
  AddContactScene,
  AppMessageLink,
  AppMessageMiniProgram,
  ChatRoomMember,
  Contact,
  EncryptedFileType,
  ForwardMessageResponse,
  ImageType as PadLocalImageType,
  Label,
  LoginPolicy,
  LoginType,
  Message,
  MessageRevokeInfo,
  QRCodeEvent,
  QRCodeStatus,
  SendTextMessageResponse,
  SyncEvent,
} from "padlocal-client-ts/dist/proto/padlocal_pb";
import { genIdempotentId } from "padlocal-client-ts/dist/utils/Utils";
import { CacheManager, RoomMemberMap } from "./padlocal/cache-manager";
import { isIMContactId, isRoomId } from "./padlocal/utils/is-type";
import {
  chatRoomMemberToContact,
  padLocalContactToWechaty,
  padLocalMessageToWechaty,
  padLocalRoomMemberToWechaty,
  padLocalRoomToWechaty,
} from "./padlocal/schema-mapper";
import { appMessageParser } from "./padlocal/message-parser/helpers/message-appmsg";
import { miniProgramMessageParser } from "./padlocal/message-parser/helpers/message-miniprogram";
import { parseMessage } from "./padlocal/message-parser";
import { MessageCategory } from "./padlocal/message-parser/message-parser-type";
import * as XMLParser from "fast-xml-parser";
import {
  EmojiMessagePayload,
  emotionPayloadGenerator,
  emotionPayloadParser,
} from "./padlocal/message-parser/helpers/message-emotion";
import { Bytes, hexStringToBytes } from "padlocal-client-ts/dist/utils/ByteUtils";
import { CachedPromiseFunc } from "./padlocal/utils/cached-promise";
import { SerialExecutor } from "padlocal-client-ts/dist/utils/SerialExecutor";
import { isRoomLeaveDebouncing } from "./padlocal/message-parser/message-parser-room-leave";
import { WechatMessageType } from "./padlocal/message-parser/WechatMessageType";
import { RetryStrategy, RetryStrategyRule } from "padlocal-client-ts/dist/utils/RetryStrategy";
import nodeUrl from "url";

export type PuppetPadlocalOptions = PuppetOptions & {
  serverCAFilePath?: string;
  defaultLoginPolicy?: LoginPolicy;
};

const PRE = "[PuppetPadlocal]";
const SEARCH_CONTACT_PREFIX = "$search$-";

const logLevel = process.env.PADLOCAL_LOG || process.env.WECHATY_LOG;
if (logLevel) {
  log.level(logLevel.toLowerCase() as any);
  log.silly(PRE, "set level to %s", logLevel);
} else {
  // set default log level
  log.level("info");
}

class PuppetPadlocal extends Puppet {
  private _client?: PadLocalClient;
  private _cacheMgr?: CacheManager;
  private _onPushSerialExecutor: SerialExecutor = new SerialExecutor();
  private _printVersion: boolean = true;
  private _restartStrategy = RetryStrategy.getStrategy(RetryStrategyRule.FAST, Number.MAX_SAFE_INTEGER);
  private _heartBeatTimer?: NodeJS.Timeout;

  constructor(public options: PuppetPadlocalOptions = {}) {
    super(options);

    // try to fill token from env if not exits
    if (!this.options.token) {
      const token = process.env.WECHATY_PUPPET_PADLOCAL_TOKEN as string;
      if (!token) {
        log.error(
          "PuppetPadlocal",
          `

      WECHATY_PUPPET_PADLOCAL_TOKEN environment variable not found.

      PadLocal need a token before it can be used,
      Please set WECHATY_PUPPET_PADLOCAL_TOKEN then retry again.

    `
        );

        throw new Error("You need a valid WECHATY_PUPPET_PADLOCAL_TOKEN to use PuppetPadlocal");
      }

      this.options.token = token;
    }

    const endpoint = options.endpoint || process.env.WECHATY_PUPPET_PADLOCAL_ENDPOINT;
    if (endpoint) {
      process.env.PADLOCAL_ENDPOINT = endpoint;
    }

    const serverCAFilePath = options.serverCAFilePath || process.env.WECHATY_PUPPET_PADLOCAL_CA_FILE_PATH;
    if (serverCAFilePath) {
      process.env.PADLOCAL_CA_FILE_PATH = serverCAFilePath;
    }
  }

  public async start(): Promise<void> {
    await this._startClient(LoginPolicy.DEFAULT);
  }

  private async _startClient(loginPolicy: LoginPolicy): Promise<void> {
    if (this.state.on()) {
      log.warn(PRE, "start() is called on a ON puppet. await ready(on) and return.");
      await this.state.ready("on");
      return;
    }

    this._startPuppetHeart();

    this.state.on("pending");

    await this._setupClient();

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

    if (loginPolicy === LoginPolicy.DEFAULT && this.options.defaultLoginPolicy !== undefined) {
      loginPolicy = this.options.defaultLoginPolicy;
    }

    this._client!.api.login(loginPolicy, {
      onLoginStart: (loginType: LoginType) => {
        log.info(PRE, `start login with type: ${LoginTypeName[loginType]}`);
      },

      onOneClickEvent: onQrCodeEvent,

      onQrCodeEvent,

      onLoginSuccess: async (_) => {
        const userName = this._client!.selfContact!.getUsername();
        log.verbose(PRE, `login success: ${userName}`);

        await this.login(this._client!.selfContact!.getUsername());
      },

      // Will sync message and contact after login success, since last time login.
      onSync: async (syncEvent: SyncEvent) => {
        log.verbose(PRE, `login sync event: ${JSON.stringify(syncEvent.toObject())}`);

        for (const contact of syncEvent.getContactList()) {
          await this._onPushContact(contact);
        }

        for (const message of syncEvent.getMessageList()) {
          await this._onPushMessage(message);
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
      .catch(async (e) => {
        log.error(PRE, `login failed: ${e.stack}`, e);

        await this._stopClient(true);
      });
  }

  /**
   * called internally while login success
   * @param userId
   * @protected
   */
  protected async login(userId: string): Promise<void> {
    this._restartStrategy.reset();

    // create cache manager firstly
    this._cacheMgr = new CacheManager(userId);
    await this._cacheMgr.init();

    await super.login(userId);

    const oldContact = await this._cacheMgr.getContact(this.id!);
    if (!oldContact) {
      await this._updateContactCache(this._client!.selfContact!.toObject());
    }
  }

  /**
   * stop the bot, with account signed on, will try auto login next time bot start.
   */
  public async stop(): Promise<void> {
    await this._stopClient(false);
  }

  private async _stopClient(restart: boolean): Promise<void> {
    if (this.state.off()) {
      log.warn(PRE, "stop() is called on a OFF puppet. await ready(off) and return.");
      await this.state.ready("off");
      return;
    }

    this.state.off("pending");

    this._client!.removeAllListeners();
    this._client!.shutdown();
    this._client = undefined;

    this.id = undefined;

    if (this._cacheMgr) {
      await this._cacheMgr.close();
      this._cacheMgr = undefined;
    }

    this.state.off(true);

    this._stopPuppetHeart();

    if (restart && this._restartStrategy.canRetry()) {
      setTimeout(async () => {
        // one-click login after failure is strange, so skip it.
        await this._startClient(LoginPolicy.SKIP_ONE_CLICK);
      }, this._restartStrategy.nextRetryDelay());
    }
  }
  /**
   * logout account and stop the bot
   */
  public async logout(): Promise<void> {
    if (!this.id) {
      throw new Error("logout before login?");
    }

    await this._client!.api.logout();

    this.emit("logout", { contactId: this.id, data: "logout by self" });

    await this._stopClient(true);
  }

  ding(_data?: string): void {
    this.emit("dong", { data: "Everything is ok" });
  }

  /****************************************************************************
   * contact
   ***************************************************************************/

  public async contactSelfName(name: string): Promise<void> {
    await this._client!.api.updateSelfNickName(name);

    this._client!.selfContact!.setNickname(name);

    const contact = await this.contactRawPayload(this._client!.selfContact!.getUsername());
    contact.nickname = name;
    await this._updateContactCache(contact);
  }

  public async contactSelfQRCode(): Promise<string> {
    const response = await this._client!.api.getContactQRCode(this._client!.selfContact!.getUsername(), 1);

    const fileBox = FileBox.fromBuffer(Buffer.from(response.getQrcode()), `qr-${this.id}.jpg`);
    return fileBox.toQRCode();
  }

  public async contactSelfSignature(signature: string): Promise<void> {
    await this._client!.api.updateSelfSignature(signature);

    this._client!.selfContact!.setSignature(signature);

    const contact = await this.contactRawPayload(this._client!.selfContact!.getUsername());
    contact.signature = signature;
    await this._updateContactCache(contact);
  }

  public contactAlias(contactId: string): Promise<string>;
  public contactAlias(contactId: string, alias: string | null): Promise<void>;
  public async contactAlias(contactId: string, alias?: string | null): Promise<void | string> {
    const contact = await this.contactRawPayload(contactId);

    if (alias) {
      await this._client!.api.updateContactRemark(contactId, alias || "");

      contact.remark = alias;
      await this._updateContactCache(contact);
    } else {
      return contact.remark;
    }
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

  contactCorporationRemark(contactId: string, corporationRemark: string | null): Promise<void> {
    throw new Error(
      `contactCorporationRemark(${contactId}, ${corporationRemark}) called failed: Method not supported.`
    );
  }

  contactDescription(contactId: string, description: string | null): Promise<void> {
    throw new Error(`contactDescription(${contactId}, ${description}) called failed: Method not supported.`);
  }

  contactPhone(contactId: string, phoneList: string[]): Promise<void> {
    throw new Error(`contactPhone(${contactId}, ${phoneList}) called failed: Method not supported.`);
  }

  public async contactDelete(contactId: string): Promise<void> {
    const contact = await this._refreshContact(contactId);
    if (contact.getStranger()) {
      log.warn(`can not delete contact which is not a friend:: ${contactId}`);
      return;
    }

    await this._client!.api.deleteContact(contactId);

    await this._refreshContact(contactId);
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
      log.warn(`contact: ${contactId} has already assigned tag: ${tagName}`);
      return;
    }

    contactLabelIds.push(label.getId());
    await this._client!.api.setContactLabel(contactId, contactLabelIds);

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
    await this._client!.api.setContactLabel(contactId, contactLabelIds);

    contact.label = contactLabelIds.join(",");
    await this._updateContactCache(contact);
  }

  public async tagContactDelete(tagName: string): Promise<void> {
    const label = (await this._findTagWithName(tagName, false))!;
    if (!label) {
      throw new Error(`tag:${tagName} doesn't exist`);
    }

    await this._client!.api.removeLabel(label.getId());

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
    const userName = friendship.contactId;

    // FIXME: workaround to make accept enterprise account work. can be done in a better way
    if (isIMContactId(userName)) {
      await this._refreshContact(userName, friendship.ticket);
    }

    await this._client!.api.acceptUser(userName, friendship.ticket, friendship.stranger!, friendship.scene!);

    // after adding friend, new version of contact will be pushed
  }

  public async friendshipAdd(contactId: string, hello: string): Promise<void> {
    let stranger: string;
    let ticket: string;
    let addContactScene: AddContactScene;

    const cachedContactSearch = await this._cacheMgr!.getContactSearch(contactId);
    if (cachedContactSearch) {
      stranger = cachedContactSearch.encryptusername;
      ticket = cachedContactSearch.antispamticket;
      addContactScene = cachedContactSearch.toaddscene;
    } else {
      const contactPayload = await this.contactRawPayload(contactId);
      let contactAlias = contactPayload.alias;
      if (!contactAlias) {
        // add contact from room,
        const roomIds = await this._findRoomIdForUserName(contactId);
        if (!roomIds.length) {
          throw new Error(`Can not find room for contact while adding friendship: ${contactId}`);
        }

        const roomId = roomIds[0];
        const contact = await this._client!.api.getChatRoomMember(roomId, contactId);
        await this._updateContactCache(contact.toObject());

        contactAlias = contact.getAlias();
      }

      const res = await this._client!.api.searchContact(contactAlias);

      if (!res.getAntispamticket()) {
        throw new Error(`contact:${contactId} is already a friend`);
      }

      stranger = res.getEncryptusername();
      ticket = res.getAntispamticket();
      addContactScene = res.getToaddscene();
    }

    await this._client!.api.addContact(stranger, ticket, addContactScene, hello);
  }

  public async friendshipSearchPhone(phone: string): Promise<null | string> {
    return this._friendshipSearch(phone);
  }

  public async friendshipSearchWeixin(weixin: string): Promise<null | string> {
    return this._friendshipSearch(weixin);
  }

  private async _friendshipSearch(id: string): Promise<null | string> {
    const cachedContactSearch = await this._cacheMgr!.getContactSearch(id);
    if (cachedContactSearch) {
      return id;
    }

    const res = await this._client!.api.searchContact(id);

    const searchId = `${SEARCH_CONTACT_PREFIX}${id}`;
    await this._cacheMgr!.setContactSearch(searchId, res.toObject());

    return searchId;
  }

  private async _findRoomIdForUserName(userName: string): Promise<string[]> {
    const ret = [];

    const roomIds = (await this._cacheMgr?.getRoomIds()) || [];
    for (const roomId of roomIds) {
      const roomMember = await this._cacheMgr?.getRoomMember(roomId);
      if (!roomMember) {
        continue;
      }

      const roomMemberIds = Object.keys(roomMember);
      if (roomMemberIds.indexOf(userName) !== -1) {
        ret.push(roomId);
      }
    }

    return ret;
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
          // json marshalled binary into base64 string
          if (typeof messagePayload.binarypayload === "string") {
            audioData = Buffer.from(messagePayload.binarypayload, "base64");
          } else {
            audioData = Buffer.from(messagePayload.binarypayload);
          }
        } else {
          audioData = await this._client!.api.getMessageVoice(messageId, message.text!, messagePayload.tousername);
        }
        const audioFileBox = FileBox.fromBuffer(audioData, `message-${messageId}-audio.slk`);
        audioFileBox.mimeType = "audio/silk";

        const options = {
          attributeNamePrefix: "",
          attrNodeName: "$",
          ignoreAttributes: false,
        };
        const msgXmlObj = XMLParser.parse(messagePayload.content, options);
        const voiceLength = parseInt(msgXmlObj.msg.voicemsg.$.voicelength, 10);
        audioFileBox.metadata = {
          voiceLength,
        };
        return audioFileBox;

      case MessageType.Video:
        const videoData = await this._client!.api.getMessageVideo(message.text!, messagePayload.tousername);
        const videoFileBox = FileBox.fromBuffer(videoData, `message-${messageId}-video.mp4`);
        videoFileBox.mimeType = "video/mp4";
        return videoFileBox;

      case MessageType.Attachment:
        const appMsg = await appMessageParser(messagePayload);
        const fileData = await this._client!.api.getMessageAttach(message.text!, messagePayload.tousername);
        const binaryFileBox = FileBox.fromBuffer(fileData, appMsg.title);
        binaryFileBox.mimeType = "application/octet-stream";
        return binaryFileBox;

      case MessageType.Emoticon:
        const emotionPayload = await emotionPayloadParser(messagePayload);
        const emoticonBox = FileBox.fromUrl(emotionPayload.cdnurl, `message-${messageId}-emotion.jpg`);

        emoticonBox.metadata = emotionPayload;
        emoticonBox.mimeType = "emoticon";

        return emoticonBox;

      case MessageType.MiniProgram:
        const thumbData = await this._client!.api.getMessageMiniProgramThumb(
          messagePayload.content,
          messagePayload.tousername
        );
        return FileBox.fromBuffer(thumbData, `message-${messageId}-miniprogram-thumb.jpg`);

      case MessageType.Url:
        const appPayload = await appMessageParser(messagePayload);

        if (appPayload.thumburl) {
          return FileBox.fromUrl(appPayload.thumburl);
        } else {
          const urlThumbData = await this._client!.api.getMessageAttachThumb(
            messagePayload.content,
            messagePayload.tousername
          );
          return FileBox.fromBuffer(urlThumbData, `message-${messageId}-url-thumb.jpg`);
        }

      default:
        throw new Error(`Can not get file for message: ${messageId}`);
    }
  }

  public async messageImage(messageId: string, imageType: ImageType): Promise<FileBox> {
    const messagePayload: Message.AsObject = await this.messageRawPayload(messageId);
    const message: MessagePayload = await this.messageRawPayloadParser(messagePayload);

    if (message.type !== MessageType.Image) {
      throw new Error(`message ${messageId} is not image type message`);
    }

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
    const ret = await this._client!.api.getMessageImage(messagePayload.content, messagePayload.tousername, pbImageType);

    let imageNameSuffix: string;
    if (ret.imageType === PadLocalImageType.THUMB) {
      imageNameSuffix = "thumb";
    } else if (ret.imageType === PadLocalImageType.HD) {
      imageNameSuffix = "hd";
    } else {
      imageNameSuffix = "normal";
    }

    return FileBox.fromBuffer(ret.imageData, `message-${messageId}-image-${imageNameSuffix}.jpg`);
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

    // FIXME: thumb may not in appPayload.thumburl, but in appPayload.appAttachPayload
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

  public async messageSendContact(toUserName: string, contactId: string): Promise<string> {
    const contactPayload = await this.contactRawPayload(contactId);
    const contact = new Contact()
      .setUsername(contactPayload.username)
      .setNickname(contactPayload.nickname)
      .setAvatar(contactPayload.avatar)
      .setGender(contactPayload.gender)
      .setSignature(contactPayload.signature)
      .setAlias(contactPayload.alias)
      .setLabel(contactPayload.label)
      .setRemark(contactPayload.remark)
      .setCity(contactPayload.city)
      .setProvince(contactPayload.province)
      .setCountry(contactPayload.country)
      .setContactaddscene(contactPayload.contactaddscene)
      .setStranger(contactPayload.stranger);
    const response = await this._client!.api.sendContactCardMessage(genIdempotentId(), toUserName, contact);

    const pushContent =
      (isRoomId(toUserName) ? `${this._client!.selfContact!.getNickname()}: ` : "") +
      "向你推荐了" +
      contact.getNickname();

    await this._onSendMessage(
      new Message()
        .setType(WechatMessageType.Text) // FIXME: difficult to construct a legal Contact message, use text instead.
        .setFromusername(this.id!)
        .setTousername(toUserName)
        .setContent(pushContent)
        .setPushcontent(pushContent),
      response.getMsgid(),
      response.getMessagerevokeinfo()!
    );

    return response.getMsgid();
  }

  public async messageSendFile(toUserName: string, fileBox: FileBox): Promise<string> {
    // image/jpeg, image/png
    if (fileBox.mimeType?.startsWith("image/")) {
      const imageData = await fileBox.toBuffer();
      const response = await this._client!.api.sendImageMessage(genIdempotentId(), toUserName, imageData);

      const pushContent = isRoomId(toUserName) ? `${this._client!.selfContact!.getNickname()}: [图片]` : "[图片]";

      await this._onSendMessage(
        new Message()
          .setType(WechatMessageType.Text) // FIXME: difficult to construct a legal Image message, use text instead.
          .setFromusername(this.id!)
          .setTousername(toUserName)
          .setContent(pushContent)
          .setPushcontent(pushContent),
        response.getMsgid(),
        response.getMessagerevokeinfo()!
      );

      return response.getMsgid();
    }

    // audio/silk
    else if (fileBox.mimeType === "audio/silk") {
      const audioData = await fileBox.toBuffer();
      const response = await this._client!.api.sendVoiceMessage(
        genIdempotentId(),
        toUserName,
        audioData,
        fileBox.metadata.voiceLength
      );

      const pushContent = isRoomId(toUserName) ? `${this._client!.selfContact!.getNickname()}: [语音]` : "[语音]";

      await this._onSendMessage(
        new Message()
          .setType(WechatMessageType.Text) // FIXME: difficult to construct a legal Voice message, use text instead.
          .setFromusername(this.id!)
          .setTousername(toUserName)
          .setContent(pushContent)
          .setPushcontent(pushContent),
        response.getMsgid(),
        response.getMessagerevokeinfo()!
      );

      return response.getMsgid();
    }

    // video/mp4
    else if (fileBox.mimeType?.startsWith("video/")) {
      const videoData = await fileBox.toBuffer();
      const response = await this._client!.api.sendVideoMessage(genIdempotentId(), toUserName, videoData);

      const pushContent = isRoomId(toUserName) ? `${this._client!.selfContact!.getNickname()}: [视频]` : "[视频]";

      await this._onSendMessage(
        new Message()
          .setType(WechatMessageType.Text) // FIXME: difficult to construct a legal Video message, use text instead.
          .setFromusername(this.id!)
          .setTousername(toUserName)
          .setContent(pushContent)
          .setPushcontent(pushContent),
        response.getMsgid(),
        response.getMessagerevokeinfo()!
      );

      return response.getMsgid();
    }

    // emotion
    else if (fileBox.mimeType === "emoticon") {
      const emotionPayload: EmojiMessagePayload = fileBox.metadata as EmojiMessagePayload;

      const response = await this._client!.api.sendMessageEmoji(
        genIdempotentId(),
        toUserName,
        emotionPayload.md5,
        emotionPayload.len,
        emotionPayload.type,
        emotionPayload.gameext
      );

      const pushContent = isRoomId(toUserName)
        ? `${this._client!.selfContact!.getNickname()}: [动画表情]`
        : "[动画表情]";

      const content = emotionPayloadGenerator(emotionPayload);

      await this._onSendMessage(
        new Message()
          .setType(WechatMessageType.Emoticon)
          .setFromusername(this.id!)
          .setTousername(toUserName)
          .setContent(content)
          .setPushcontent(pushContent),
        response.getMsgid(),
        response.getMessagerevokeinfo()!
      );

      return response.getMsgid();
    }

    // try to send any other type as binary fileBox
    // application/octet-stream
    else {
      const fileData = await fileBox.toBuffer();
      const response = await this._client!.api.sendFileMessage(genIdempotentId(), toUserName, fileData, fileBox.name);

      const pushContent = isRoomId(toUserName) ? `${this._client!.selfContact!.getNickname()}: [文件]` : "[文件]";

      await this._onSendMessage(
        new Message()
          .setType(WechatMessageType.Text) // FIXME: difficult to construct a legal File message, use text instead.
          .setFromusername(this.id!)
          .setTousername(toUserName)
          .setContent(pushContent)
          .setPushcontent(pushContent),
        response.getMsgid(),
        response.getMessagerevokeinfo()!
      );

      return response.getMsgid();
    }
  }

  public async messageSendMiniProgram(toUserName: string, mpPayload: MiniProgramPayload): Promise<string> {
    const miniProgram = new AppMessageMiniProgram();
    mpPayload.appid && miniProgram.setMpappid(mpPayload.appid);
    mpPayload.title && miniProgram.setTitle(mpPayload.title);
    mpPayload.pagePath && miniProgram.setMpapppath(mpPayload.pagePath);
    mpPayload.iconUrl && miniProgram.setMpappiconurl(mpPayload.iconUrl);
    mpPayload.description && miniProgram.setDescription(mpPayload.description);
    mpPayload.description && miniProgram.setMpappname(mpPayload.description);
    mpPayload.username && miniProgram.setMpappusername(mpPayload.username);

    let thumbImageData: Bytes | null = null;

    // 1. cdn url and key
    if (mpPayload.thumbUrl && mpPayload.thumbKey) {
      thumbImageData = await this._client!.api.getEncryptedFile(
        EncryptedFileType.IMAGE_THUMB,
        mpPayload.thumbUrl,
        hexStringToBytes(mpPayload.thumbKey)
      );
    }

    // 2. http url
    else if (mpPayload.thumbUrl) {
      const parsedUrl = new nodeUrl.URL(mpPayload.thumbUrl);
      if (parsedUrl.protocol.startsWith("http")) {
        // download the image data
        const imageBox = FileBox.fromUrl(mpPayload.thumbUrl);
        thumbImageData = await imageBox.toBuffer();
      }
    }

    if (!thumbImageData) {
      log.warn(PRE, "no thumb image found while sending mimi program");
    }

    const response = await this._client!.api.sendMessageMiniProgram(
      genIdempotentId(),
      toUserName,
      miniProgram,
      thumbImageData
    );
    const pushContent = isRoomId(toUserName)
      ? `${this._client!.selfContact!.getNickname()}: [小程序] ${mpPayload.title}`
      : `[小程序] ${mpPayload.title}`;

    await this._onSendMessage(
      new Message()
        .setType(WechatMessageType.App)
        .setFromusername(this.id!)
        .setTousername(toUserName)
        .setContent(response.getMsgcontent())
        .setPushcontent(pushContent),
      response.getMsgid(),
      response.getMessagerevokeinfo()!
    );

    return response.getMsgid();
  }

  public async messageSendText(toUserName: string, text: string, mentionIdList?: string[]): Promise<string> {
    const response: SendTextMessageResponse = await this._client!.api.sendTextMessage(
      genIdempotentId(),
      toUserName,
      text,
      mentionIdList
    );

    const pushContent = isRoomId(toUserName) ? `${this._client!.selfContact!.getNickname()}: ${text}` : text;

    await this._onSendMessage(
      new Message()
        .setType(WechatMessageType.Text)
        .setFromusername(this.id!)
        .setTousername(toUserName)
        .setContent(text)
        .setPushcontent(pushContent),
      response.getMsgid(),
      response.getMessagerevokeinfo()!
    );

    return response.getMsgid();
  }

  public async messageSendUrl(toUserName: string, linkPayload: UrlLinkPayload): Promise<string> {
    const appMessageLink = new AppMessageLink();

    appMessageLink.setTitle(linkPayload.title).setUrl(linkPayload.url);
    linkPayload.description && appMessageLink.setDescription(linkPayload.description);
    if (linkPayload.thumbnailUrl) {
      appMessageLink.setThumburl(linkPayload.thumbnailUrl);
    }

    const response = await this._client!.api.sendMessageLink(genIdempotentId(), toUserName, appMessageLink);
    const pushContent = isRoomId(toUserName)
      ? `${this._client!.selfContact!.getNickname()}: [链接] ${linkPayload.title}`
      : `[链接] ${linkPayload.title}`;

    await this._onSendMessage(
      new Message()
        .setType(WechatMessageType.App)
        .setFromusername(this.id!)
        .setTousername(toUserName)
        .setContent(response.getMsgcontent())
        .setPushcontent(pushContent),
      response.getMsgid(),
      response.getMessagerevokeinfo()!
    );

    return response.getMsgid();
  }

  public async messageRecall(messageId: string): Promise<boolean> {
    const message = (await this._cacheMgr!.getMessage(messageId))!;

    const messageRevokeInfo = (await this._cacheMgr!.getMessageRevokeInfo(messageId))!;
    await this._client!.api.revokeMessage(
      messageId,
      message.fromusername,
      message.tousername,
      new MessageRevokeInfo()
        .setClientmsgid(messageRevokeInfo.clientmsgid)
        .setNewclientmsgid(messageRevokeInfo.newclientmsgid)
        .setCreatetime(messageRevokeInfo.createtime)
    );

    return true;
  }

  public async messageForward(toUserName: string, messageId: string): Promise<string> {
    const messagePayload = await this.messageRawPayload(messageId);
    const message = await this.messageRawPayloadParser(messagePayload);

    let newMessageId: string;

    switch (message.type) {
      case MessageType.Text:
        newMessageId = await this.messageSendText(toUserName, message.text!);
        break;

      case MessageType.Image:
        const imageFileBox = await this.messageImage(messageId, ImageType.HD);
        newMessageId = await this.messageSendFile(toUserName, imageFileBox);
        break;

      case MessageType.Audio:
        const audioFileBox = await this.messageFile(messageId);
        newMessageId = await this.messageSendFile(toUserName, audioFileBox);
        break;

      case MessageType.Video:
        const videoFileBox = await this.messageFile(messageId);
        newMessageId = await this.messageSendFile(toUserName, videoFileBox);
        break;

      case MessageType.Attachment:
      case MessageType.MiniProgram:
      case MessageType.Url:
        const response: ForwardMessageResponse = await this._client!.api.forwardMessage(
          genIdempotentId(),
          toUserName,
          messagePayload.content,
          messagePayload.type,
          messagePayload.tousername
        );
        newMessageId = response.getMsgid();
        break;

      case MessageType.Emoticon:
        const emotionBox = await this.messageFile(messageId);
        newMessageId = await this.messageSendFile(toUserName, emotionBox);
        break;

      default:
        throw new Error(`Message forwarding is unsupported for messageId:${messageId}, type:${message.type}`);
    }

    return newMessageId;
  }

  /****************************************************************************
   * room
   ***************************************************************************/

  public async roomAdd(roomId: string, contactId: string): Promise<void> {
    await this._client!.api.addChatRoomMember(roomId, contactId);
  }

  public async roomAvatar(roomId: string): Promise<FileBox> {
    const chatroom = await this.roomRawPayload(roomId);
    return FileBox.fromUrl(chatroom.avatar || "");
  }

  public async roomCreate(contactIdList: string[], topic?: string): Promise<string> {
    const res = await this._client!.api.createChatRoom(genIdempotentId(), contactIdList);

    if (topic) {
      await this._client!.api.setChatRoomName(res.getRoomid(), topic);
    }

    return res.getRoomid();
  }

  public async roomDel(roomId: string, contactId: string): Promise<void> {
    await this._client!.api.deleteChatRoomMember(roomId, contactId);
  }

  public async roomList(): Promise<string[]> {
    return this._cacheMgr!.getRoomIds();
  }

  public async roomQRCode(roomId: string): Promise<string> {
    const res = await this._client!.api.getChatRoomQrCode(roomId);

    const fileBox = FileBox.fromBuffer(Buffer.from(res.getQrcode()), `qr-${this.id}.jpg`);
    return fileBox.toQRCode();
  }

  public async roomQuit(roomId: string): Promise<void> {
    await this._client!.api.quitChatRoom(roomId);
  }

  public async roomTopic(roomId: string): Promise<string>;
  public async roomTopic(roomId: string, topic: string): Promise<void>;
  public async roomTopic(roomId: string, topic?: string): Promise<void | string> {
    await this._client!.api.setChatRoomName(roomId, topic || "");
  }

  public async roomAnnounce(roomId: string): Promise<string>;
  public async roomAnnounce(roomId: string, text: string): Promise<void>;
  public async roomAnnounce(roomId: string, text?: string): Promise<void | string> {
    if (text === undefined) {
      return this._client!.api.getChatRoomAnnouncement(roomId);
    } else {
      await this._client!.api.setChatRoomAnnouncement(roomId, text);
    }
  }

  public async roomMemberList(roomId: string): Promise<string[]> {
    const roomMemberMap = await this._getRoomMemberList(roomId);
    return Object.values(roomMemberMap).map((m) => m.username);
  }

  public async roomInvitationAccept(roomInvitationId: string): Promise<void> {
    const roomInvitation = await this.roomInvitationRawPayload(roomInvitationId);
    await this._client!.api.acceptChatRoomInvitation(roomInvitation.inviterId, roomInvitation.invitation);
  }

  /****************************************************************************
   * RawPayload section
   ***************************************************************************/

  public async contactRawPayloadParser(payload: Contact.AsObject): Promise<ContactPayload> {
    return padLocalContactToWechaty(payload);
  }

  public async contactRawPayload(id: string): Promise<Contact.AsObject> {
    if (id.startsWith(SEARCH_CONTACT_PREFIX)) {
      const searchContact = await this._cacheMgr?.getContactSearch(id);
      return searchContact!.contact!;
    }

    let ret = await this._cacheMgr!.getContact(id);

    if (!ret) {
      ret = await CachedPromiseFunc(`contactRawPayload-${id}`, async () => {
        const contact = await this._refreshContact(id);
        return contact.toObject();
      });
    }

    return ret;
  }

  public async messageRawPayloadParser(payload: Message.AsObject): Promise<MessagePayload> {
    return padLocalMessageToWechaty(this, payload);
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
      const contact = await this._refreshContact(id);
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
      const newLabelId = await this._client!.api.addLabel(tagName);
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
      labelList = await this._client!.api.getLabelList();
      this._cacheMgr?.setLabelList(labelList);
      fromCache = false;
    }

    return {
      labelList,
      fromCache,
    };
  }

  private async _getRoomMemberList(roomId: string, force?: boolean): Promise<RoomMemberMap> {
    let ret = await this._cacheMgr!.getRoomMember(roomId);
    if (!ret || force) {
      const resMembers = await this._client!.api.getChatRoomMembers(roomId);

      const roomMemberMap: RoomMemberMap = {};

      for (const roomMember of resMembers) {
        const contact = chatRoomMemberToContact(roomMember);

        const hasContact = await this._cacheMgr!.hasContact(contact.getUsername());
        // save chat room member as contact, to forbid massive this._client.api.getContact(id) requests while room.ready()
        if (!hasContact) {
          await this._cacheMgr!.setContact(contact.getUsername(), contact.toObject());
        }

        roomMemberMap[roomMember.getUsername()] = roomMember.toObject();
      }

      ret = roomMemberMap;

      await this._updateRoomMember(roomId, roomMemberMap);
    }

    return ret;
  }

  private async _updateContactCache(contact: Contact.AsObject): Promise<void> {
    if (!contact.username) {
      log.warn(PRE, `username is required for contact: ${JSON.stringify(contact)}`);
      return;
    }

    if (isRoomId(contact.username)) {
      const oldRoomPayload = await this._cacheMgr!.getRoom(contact.username);
      if (oldRoomPayload) {
        // some contact push may not contain avatar, e.g. modify room announcement
        if (!contact.avatar) {
          contact.avatar = oldRoomPayload.avatar;
        }

        // If case you are not the chatroom owner, room leave message will not be sent.
        // Calc the room member diffs, then send room leave event instead.
        if (contact.chatroommemberList.length < oldRoomPayload.chatroommemberList.length) {
          const newMemberIdSet = new Set(contact.chatroommemberList.map((m) => m.username));
          const removedMemberIdList = oldRoomPayload.chatroommemberList
            .filter((m) => !newMemberIdSet.has(m.username))
            .map((m) => m.username)
            .filter((removeeId) => !isRoomLeaveDebouncing(contact.username, removeeId));

          if (removedMemberIdList.length) {
            removedMemberIdList.forEach((removeeId) => {
              const roomLeave: EventRoomLeavePayload = {
                removeeIdList: [removeeId],
                removerId: removeeId,
                roomId: contact.username,
                timestamp: Math.floor(Date.now() / 1000),
              };
              this.emit("room-leave", roomLeave);
            });
          }
        }
      }

      const roomId = contact.username;
      await this._cacheMgr!.setRoom(roomId, contact);
      await this.dirtyPayload(PayloadType.Room, roomId);

      await this._updateRoomMember(roomId);
    } else {
      await this._cacheMgr!.setContact(contact.username, contact);
      await this.dirtyPayload(PayloadType.Contact, contact.username);
    }
  }

  private async _updateRoomMember(roomId: string, roomMemberMap?: RoomMemberMap) {
    if (roomMemberMap) {
      await this._cacheMgr!.setRoomMember(roomId, roomMemberMap);
    } else {
      await this._cacheMgr!.deleteRoomMember(roomId);
    }

    await this.dirtyPayload(PayloadType.RoomMember, roomId);
  }

  private async _onPushContact(contact: Contact): Promise<void> {
    log.verbose(PRE, `on push contact: ${JSON.stringify(contact.toObject())}`);
    return this._updateContactCache(contact.toObject());
  }

  private async _onPushMessage(message: Message): Promise<void> {
    const messageId = message.getId();

    log.verbose(PRE, `on push original message: ${JSON.stringify(message.toObject())}`);
    log.verbose(PRE, Buffer.from(message.serializeBinary()).toString("hex"));

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

        await this._updateRoomMember(roomJoin.roomId);
        break;

      case MessageCategory.RoomLeave:
        const roomLeave: EventRoomLeavePayload = parseRet.payload;
        this.emit("room-leave", roomLeave);

        await this._updateRoomMember(roomLeave.roomId);
        break;

      case MessageCategory.RoomTopic:
        const roomTopic: EventRoomTopicPayload = parseRet.payload;
        this.emit("room-topic", roomTopic);
    }
  }

  private async _onSendMessage(partialMessage: Message, messageId: string, messageRevokeInfo: MessageRevokeInfo) {
    partialMessage.setId(messageId);
    partialMessage.setCreatetime(messageRevokeInfo.getCreatetime());

    await this._cacheMgr!.setMessage(messageId, partialMessage.toObject());
    await this._cacheMgr!.setMessageRevokeInfo(messageId, messageRevokeInfo.toObject());
  }

  private async _setupClient() {
    this._client = await PadLocalClient.create(this.options.token!, true);

    this._client.on("kickout", async (_detail: KickOutEvent) => {
      this.emit("logout", { contactId: this.id!, data: _detail.errorMessage });

      await this._stopClient(true);
    });

    this._client.on("message", async (messageList: Message[]) => {
      await this._onPushSerialExecutor.execute(async () => {
        for (const message of messageList) {
          // handle message one by one
          await this._onPushMessage(message);
        }
      });
    });

    this._client.on("contact", async (contactList: Contact[]) => {
      await this._onPushSerialExecutor.execute(async () => {
        for (const contact of contactList) {
          await this._onPushContact(contact);
        }
      });
    });

    if (this._printVersion) {
      // only print once
      this._printVersion = false;

      log.info(`
      ============================================================
       Welcome to Wechaty PadLocal puppet!

       - wechaty-puppet-padlocal version: ${this.version()}
       - padlocal-ts-client version: ${this._client.version}
      ============================================================
    `);
    }
  }

  private async _refreshContact(userName: string, ticket?: string): Promise<Contact> {
    const contact = await this._client!.api.getContact(userName, ticket);

    // may return contact with empty payload, empty username, nickname, etc.
    if (!contact.getUsername()) {
      contact.setUsername(userName);
    }

    await this._updateContactCache(contact.toObject());

    return contact;
  }

  private _startPuppetHeart(firstTime: boolean = true) {
    if (firstTime && this._heartBeatTimer) {
      return;
    }

    this.emit("heartbeat", { data: "heartbeat@padlocal" });

    this._heartBeatTimer = setTimeout(() => {
      this._startPuppetHeart(false);
    }, 15 * 1000); // 15s
  }

  private _stopPuppetHeart() {
    if (!this._heartBeatTimer) {
      return;
    }

    clearTimeout(this._heartBeatTimer);
    this._heartBeatTimer = undefined;
  }
}

export { PuppetPadlocal };
export default PuppetPadlocal;
