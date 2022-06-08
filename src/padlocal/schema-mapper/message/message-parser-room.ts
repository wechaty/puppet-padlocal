import type * as PUPPET from "wechaty-puppet";
import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import { isIMRoomId, isRoomId } from "../../utils/is-type.js";
import {
  fixPayloadForRoomMessageSentByOthers,
  parseContactFromRoomMessageContent,
} from "../../messages/message-room.js";
import type { MessageParser, MessageParserContext } from "./message-parser";

async function roomMessageSentByOthers(padLocalMessage: PadLocal.Message.AsObject, ret: PUPPET.payloads.Message) {
  if (isRoomId(padLocalMessage.fromusername) || isIMRoomId(padLocalMessage.fromusername)) {
    ret.roomId = padLocalMessage.fromusername;

    const payload = await fixPayloadForRoomMessageSentByOthers(padLocalMessage);
    if (payload) {
      ret.text = payload.text;
      ret.talkerId = payload.talkerId;
      ret.listenerId = payload.listenerId;
    } else {
      /**
       * Message that can not get talkerId from payload:
       * 1. Create room with users that have deleted you: https://gist.github.com/padlocal/e95f8e05eb00556317991964eecfd150
       *
       * But talkerId is required by Wechaty, or exception will be raised:
       * https://github.com/wechaty/wechaty/blob/435cefd90baf7f2a0c801010132e74f9e0575fc2/src/user-modules/message.ts#L813
       * Solution: we set talkerId to fromusername, treating these kinds of messages are sent by self.
       */
      ret.talkerId = padLocalMessage.tousername;
    }
  }
}

async function roomMessageSentBySelf(padLocalMessage: PadLocal.Message.AsObject, ret: PUPPET.payloads.Message) {
  if (isRoomId(padLocalMessage.tousername) || isIMRoomId(padLocalMessage.tousername)) {
    // room message sent by self

    ret.roomId = padLocalMessage.tousername;
    ret.talkerId = padLocalMessage.fromusername;

    const startIndex = padLocalMessage.content.indexOf(":\n");
    if (startIndex !== -1) {
      ret.text = padLocalMessage.content.slice(startIndex + 2);
    }

    // try to parse listenerId for messages, e.g. pat message
    const contactInfo = await parseContactFromRoomMessageContent(padLocalMessage);
    ret.listenerId = contactInfo?.listenerId;
  }
}

export const roomParser: MessageParser = async(padLocalMessage: PadLocal.Message.AsObject, ret: PUPPET.payloads.Message, context: MessageParserContext) => {
  await roomMessageSentByOthers(padLocalMessage, ret);
  await roomMessageSentBySelf(padLocalMessage, ret);

  if (ret.roomId) {
    context.isRoomMessage = true;

    let mentionIdList: string[];
    if (padLocalMessage.atList.length === 1 && padLocalMessage.atList[0] === "announcement@all") {
      const roomPayload = await context.puppet.roomPayload(ret.roomId);
      mentionIdList = roomPayload.memberIdList;
    } else {
      mentionIdList = padLocalMessage.atList;
    }

    const room = ret as PUPPET.payloads.MessageRoom;
    room.mentionIdList = mentionIdList;
  }

  return ret;
};
