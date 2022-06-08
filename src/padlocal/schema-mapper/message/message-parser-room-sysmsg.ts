import type { MessageParser, MessageParserContext } from "./message-parser.js";
import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import type * as PUPPET from "wechaty-puppet";
import { parseSysmsgMessagePayload } from "../../messages/message-sysmsg.js";
import type { PatMessagePayload } from "../../messages/sysmsg/message-pat.js";
import type { TodoMessagePayload } from "../../messages/sysmsg/message-todo.js";
import { isContactId, isIMContactId } from "../../utils/is-type.js";

export interface RoomMessageContactInfo {
  talkerId?: string,
  listenerId?: string
}

export async function parseContactFromRoomMessageContent(padLocalMessage: PadLocal.Message.AsObject): Promise<RoomMessageContactInfo | undefined> {
  let ret: RoomMessageContactInfo | undefined;

  const sysmsgPayload = await parseSysmsgMessagePayload(padLocalMessage);
  if (sysmsgPayload) {
    if (sysmsgPayload.type === "pat") {
      const patMessagePayload: PatMessagePayload = sysmsgPayload.payload as PatMessagePayload;

      ret = {
        listenerId: patMessagePayload.pattedUserName,
        talkerId: patMessagePayload.fromUserName,
      };
    } else if (sysmsgPayload.type === "roomtoolstips") {
      const todoMessagePayload: TodoMessagePayload = sysmsgPayload.payload as TodoMessagePayload;
      ret = {
        talkerId: todoMessagePayload.operatorUserName,
      };
    }
  }

  return ret;
}

/**
 * try to parse talker and listenerId from sysmsg for room messages
 * @param padLocalMessage
 * @param ret
 * @param context
 */
export const roomSysmsgParser: MessageParser = async(padLocalMessage: PadLocal.Message.AsObject, ret: PUPPET.payloads.Message, context: MessageParserContext) => {
  if (!context.isRoomMessage) {
    return ret;
  }

  const contactInfo = await parseContactFromRoomMessageContent(padLocalMessage);
  if (!contactInfo) {
    return ret;
  }

  if (contactInfo.talkerId) {
    // talkerId got via "wxid_xxxx:\nCONTENT" is the room id for pat/todo message,
    // so replace it with talkerId got from message payload
    const isTalkerIdContact = isContactId(ret.talkerId) || isIMContactId(ret.talkerId);
    if (!isTalkerIdContact) {
      ret.talkerId = contactInfo.talkerId;
    }
  }

  if (contactInfo.listenerId) {
    ret.listenerId = contactInfo.listenerId;
  }

  return ret;
};
