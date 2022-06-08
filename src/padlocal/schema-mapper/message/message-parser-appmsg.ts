import * as PUPPET from "wechaty-puppet";
import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import { log } from "wechaty-puppet";
import { LOGPRE, MessageParser, MessageParserContext } from "./message-parser.js";
import { AppMessageType, parseAppmsgMessagePayload } from "../../messages/message-appmsg.js";

export const appMsgParser: MessageParser = async(padLocalMessage: PadLocal.Message.AsObject, ret: PUPPET.payloads.Message, context: MessageParserContext) => {
  if (ret.type !== PUPPET.types.Message.Attachment) {
    return ret;
  }

  try {
    const appPayload = await parseAppmsgMessagePayload(padLocalMessage.content);
    context.appMessagePayload = appPayload;

    switch (appPayload.type) {
      case AppMessageType.Text:
        ret.type = PUPPET.types.Message.Text;
        ret.text = appPayload.title;
        break;
      case AppMessageType.Audio:
        ret.type = PUPPET.types.Message.Url;
        break;
      case AppMessageType.Video:
        ret.type = PUPPET.types.Message.Url;
        break;
      case AppMessageType.Url:
        ret.type = PUPPET.types.Message.Url;
        break;
      case AppMessageType.Attach:
        ret.type = PUPPET.types.Message.Attachment;
        ret.filename = appPayload.title;
        break;
      case AppMessageType.ChatHistory:
        ret.type = PUPPET.types.Message.ChatHistory;
        break;
      case AppMessageType.MiniProgram:
      case AppMessageType.MiniProgramApp:
        ret.type = PUPPET.types.Message.MiniProgram;
        break;
      case AppMessageType.RedEnvelopes:
        ret.type = PUPPET.types.Message.RedEnvelope;
        break;
      case AppMessageType.Transfers:
        ret.type = PUPPET.types.Message.Transfer;
        break;
      case AppMessageType.RealtimeShareLocation:
        ret.type = PUPPET.types.Message.Location;
        break;
      case AppMessageType.GroupNote:
        ret.type = PUPPET.types.Message.GroupNote;
        ret.text = appPayload.title;
        break;
      default:
        ret.type = PUPPET.types.Message.Unknown;
        break;
    }
  } catch (e) {
    log.warn(LOGPRE, `Error occurred while parse message attachment: ${JSON.stringify(padLocalMessage)} , ${(e as Error).stack}`);
  }

  return ret;
};
