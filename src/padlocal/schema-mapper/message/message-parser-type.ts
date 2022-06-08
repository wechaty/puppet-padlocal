import * as PUPPET from "wechaty-puppet";
import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import { WechatMessageType } from "../../types.js";
import { log } from "wechaty-puppet";
import type { MessageParser, MessageParserContext } from "./message-parser.js";
import { LOGPRE } from "./message-parser.js";

export const typeParser: MessageParser = async(padLocalMessage: PadLocal.Message.AsObject, ret: PUPPET.payloads.Message, _context: MessageParserContext) => {
  const wechatMessageType = padLocalMessage.type as WechatMessageType;
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
      log.verbose(LOGPRE, `unsupported type: ${JSON.stringify(padLocalMessage)}`);

      type = PUPPET.types.Message.Unknown;
  }

  ret.type = type;

  return ret;
};
