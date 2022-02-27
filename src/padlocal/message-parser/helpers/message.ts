import * as PUPPET from "wechaty-puppet";
import type { Message } from "padlocal-client-ts/dist/proto/padlocal_pb";
import { WechatMessageType } from "../WechatMessageType";

export function convertMessageType(wechatMessageType: WechatMessageType): PUPPET.types.Message {
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
    case WechatMessageType.Recalled:
      type = PUPPET.types.Message.Recalled;
      break;

    case WechatMessageType.StatusNotify:
    case WechatMessageType.SysNotice:
      type = PUPPET.types.Message.Unknown;
      break;

    default:
      throw new Error(`unsupported type: ${wechatMessageType}`);
  }

  return type;
}

export function getMessageFileName(message: Message.AsObject, messageType: PUPPET.types.Message): string {
  const msgId = message.id;

  if (messageType === PUPPET.types.Message.Audio) {
    return msgId + ".slk";
  } else if (messageType === PUPPET.types.Message.Image) {
    return msgId + ".jpg";
  } else if (messageType === PUPPET.types.Message.Video) {
    return msgId + ".mp4";
  }

  return messageType + "-to-be-implement.txt";
}
