import type { EmojiMessagePayload } from "./payload/message-emotion.js";
import * as PUPPET from "wechaty-puppet";
import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import { log } from "wechaty-puppet";

export enum WechatMessageType {
  Text = 1,
  Image = 3,
  Voice = 34,
  VerifyMsg = 37,
  PossibleFriendMsg = 40,
  ShareCard = 42,
  Video = 43,
  Emoticon = 47,
  Location = 48,
  App = 49,
  VoipMsg = 50,
  StatusNotify = 51,
  VoipNotify = 52,
  VoipInvite = 53,
  MicroVideo = 62,
  VerifyMsgEnterprise = 65,
  Transfer = 2000, // 转账
  RedEnvelope = 2001, // 红包
  MiniProgram = 2002, // 小程序
  GroupInvite = 2003, // 群邀请
  File = 2004, // 文件消息
  SysNotice = 9999,
  Sys = 10000,
  SysTemplate = 10002, // NOTIFY 服务通知
}

export type FileBoxMetadataMessageType = "unknown" | "emoticon";
export type FileBoxMetadataMessagePayload = EmojiMessagePayload;

export interface FileBoxMetadataMessage {
  type: FileBoxMetadataMessageType,
  payload: FileBoxMetadataMessagePayload
}

export function convertWechatMessageTypeToPuppet(wechatMessageType: WechatMessageType, padLocalMessage: PadLocal.Message.AsObject): PUPPET.types.Message {
  let type: PUPPET.types.Message;

  switch (wechatMessageType) {
    case WechatMessageType.Text:
      type = PUPPET.types.Message.Text;
      break;

    case WechatMessageType.Image:
      type = PUPPET.types.Message.Image;
      break;

    case WechatMessageType.Voice:
      type = PUPPET.types.Message.Audio;
      break;

    case WechatMessageType.Emoticon:
      type = PUPPET.types.Message.Emoticon;
      break;

    case WechatMessageType.App:
    case WechatMessageType.File:
      type = PUPPET.types.Message.Attachment;
      break;

    case WechatMessageType.Location:
      type = PUPPET.types.Message.Location;
      break;

    case WechatMessageType.Video:
      type = PUPPET.types.Message.Video;
      break;

    case WechatMessageType.Sys:
      type = PUPPET.types.Message.Unknown;
      break;

    case WechatMessageType.ShareCard:
      type = PUPPET.types.Message.Contact;
      break;

    case WechatMessageType.VoipMsg:
    case WechatMessageType.SysTemplate:
      type = PUPPET.types.Message.Recalled;
      break;

    case WechatMessageType.StatusNotify:
    case WechatMessageType.SysNotice:
      type = PUPPET.types.Message.Unknown;
      break;

    default:
      log.verbose("[PuppetPadlocal]", `unsupported type: ${JSON.stringify(padLocalMessage)}`);

      type = PUPPET.types.Message.Unknown;
  }

  return type;
}
