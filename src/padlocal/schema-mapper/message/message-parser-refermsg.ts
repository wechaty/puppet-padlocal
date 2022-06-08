import * as PUPPET from "wechaty-puppet";
import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import { AppMessageType, parseAppmsgMessagePayload, ReferMsgPayload } from "../../messages/message-appmsg.js";
import { WechatMessageType } from "../../types.js";
import type { MessageParser, MessageParserContext } from "./message-parser.js";

export const referMsgParser: MessageParser = async(_padLocalMessage: PadLocal.Message.AsObject, ret: PUPPET.payloads.Message, context: MessageParserContext) => {
  if (!context.appMessagePayload || context.appMessagePayload.type !== AppMessageType.ReferMsg) {
    return ret;
  }

  const appPayload = context.appMessagePayload;

  let referMessageContent: string;

  const referMessagePayload: ReferMsgPayload = appPayload.refermsg!;
  const referMessageType = parseInt(referMessagePayload.type) as WechatMessageType;
  switch (referMessageType) {
    case WechatMessageType.Text:
      referMessageContent = referMessagePayload.content;
      break;
    case WechatMessageType.Image:
      referMessageContent = "图片";
      break;

    case WechatMessageType.Video:
      referMessageContent = "视频";
      break;

    case WechatMessageType.Emoticon:
      referMessageContent = "动画表情";
      break;

    case WechatMessageType.Location:
      referMessageContent = "位置";
      break;

    case WechatMessageType.App: {
      const referMessageAppPayload = await parseAppmsgMessagePayload(referMessagePayload.content);
      referMessageContent = referMessageAppPayload.title;
      break;
    }

    default:
      referMessageContent = "未知消息";
      break;
  }

  ret.type = PUPPET.types.Message.Text;
  ret.text = `「${referMessagePayload.displayname}：${referMessageContent}」\n- - - - - - - - - - - - - - -\n${appPayload.title}`;

  return ret;
};
