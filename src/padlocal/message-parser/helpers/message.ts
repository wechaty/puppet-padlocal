import { WechatMessageType } from "wechaty-puppet/dist/src/schemas/message";
import { MessageType } from "wechaty-puppet";
import { Message } from "padlocal-client-ts/dist/proto/padlocal_pb";

export function convertMessageType(wechatMessageType: WechatMessageType): MessageType {
  let type: MessageType;

  switch (wechatMessageType) {
    case WechatMessageType.Text:
      type = MessageType.Text;
      break;

    case WechatMessageType.Image:
      type = MessageType.Image;
      break;

    case WechatMessageType.Voice:
      type = MessageType.Audio;
      break;

    case WechatMessageType.Emoticon:
      type = MessageType.Emoticon;
      break;

    case WechatMessageType.App:
      type = MessageType.Attachment;
      break;

    case WechatMessageType.Location:
      type = MessageType.Location;
      break;

    case WechatMessageType.Video:
      type = MessageType.Video;
      break;

    case WechatMessageType.Sys:
      type = MessageType.Unknown;
      break;

    case WechatMessageType.ShareCard:
      type = MessageType.Contact;
      break;

    case WechatMessageType.VoipMsg:
    case WechatMessageType.Recalled:
      type = MessageType.Recalled;
      break;

    case WechatMessageType.StatusNotify:
    case WechatMessageType.SysNotice:
      type = MessageType.Unknown;
      break;

    default:
      throw new Error(`unsupported type: ${wechatMessageType}`);
  }

  return type;
}

export function getMessageFileName(message: Message.AsObject, messageType: MessageType): string {
  const msgId = message.id;

  if (messageType === MessageType.Audio) {
    return msgId + ".slk";
  } else if (messageType === MessageType.Image) {
    return msgId + ".jpg";
  } else if (messageType === MessageType.Video) {
    return msgId + ".mp4";
  }

  return messageType + "-to-be-implement.txt";
}
