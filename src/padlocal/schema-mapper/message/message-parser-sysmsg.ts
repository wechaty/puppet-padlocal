import type { MessageParser, MessageParserContext } from "./message-parser.js";
import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import type * as PUPPET from "wechaty-puppet";
import { parseSysmsgMessagePayload } from "../../messages/message-sysmsg.js";
import type { PatMessagePayload } from "../../messages/sysmsg/message-pat.js";
import type { TodoMessagePayload } from "../../messages/sysmsg/message-todo.js";
import type { RevokeMsgMessagePayload } from "../../messages/sysmsg/message-revokemsg.js";

/**
 * try to parse talker and listenerId from sysmsg for room messages
 * @param padLocalMessage
 * @param ret
 * @param context
 */
export const sysmsgParser: MessageParser = async(padLocalMessage: PadLocal.Message.AsObject, ret: PUPPET.payloads.Message, context: MessageParserContext) => {
  const sysmsgPayload = await parseSysmsgMessagePayload(padLocalMessage);
  if (!sysmsgPayload) {
    return ret;
  }

  switch (sysmsgPayload.type) {
    case "pat": {
      const patMessagePayload: PatMessagePayload = sysmsgPayload.payload as PatMessagePayload;

      if (context.isRoomMessage) {
        ret.talkerId = patMessagePayload.pattedUserName;
        ret.listenerId = patMessagePayload.fromUserName;
      }

      break;
    }

    case "roomtoolstips": {
      const todoMessagePayload: TodoMessagePayload = sysmsgPayload.payload as TodoMessagePayload;

      if (context.isRoomMessage) {
        ret.talkerId = todoMessagePayload.operatorUserName;
      }

      break;
    }

    case "revokemsg": {
      const revokeMsgPayload: RevokeMsgMessagePayload = sysmsgPayload.payload as RevokeMsgMessagePayload;

      if (context.isRoomMessage) {
        // Generic room message logic can get the right talkerId for revoke message
      } else {
        // Fix talkerId for single chat revoke message that sent by you
        // talkerId and listenerId for revoke message sent by others is right already
        if (revokeMsgPayload.type === "You") {
          ret.listenerId = ret.talkerId;
          ret.talkerId = context.puppet.currentUserId;
        }
      }

      break;
    }
  }

  return ret;
};
