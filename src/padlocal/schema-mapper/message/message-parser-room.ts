import type * as PUPPET from "wechaty-puppet";
import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import { isIMRoomId, isRoomId } from "../../utils/is-type.js";
import type { MessageParser, MessageParserContext } from "./message-parser.js";

async function roomMessageSentByOthers(padLocalMessage: PadLocal.Message.AsObject, ret: PUPPET.payloads.Message) {
  if (isRoomId(padLocalMessage.fromusername) || isIMRoomId(padLocalMessage.fromusername)) {
    ret.roomId = padLocalMessage.fromusername;

    /**
     * separator of talkerId and content:
     *
     * text:    "wxid_xxxx:\nnihao"
     * appmsg:  "wxid_xxxx:\n<?xml version="1.0"?><msg><appmsg appid="" sdkver="0">..."
     * pat:     "19850419xxx@chatroom:\n<sysmsg type="pat"><pat><fromusername>xxx</fromusername><chatusername>19850419xxx@chatroom</chatusername><pattedusername>wxid_xxx</pattedusername>...<template><![CDATA["${vagase}" 拍了拍我]]></template></pat></sysmsg>"
     */
    const separatorIndex = padLocalMessage.content.indexOf(":\n");
    if (separatorIndex !== -1) {
      const takerIdPrefix = padLocalMessage.content.slice(0, separatorIndex);
      ret.talkerId = takerIdPrefix;
      ret.text = padLocalMessage.content.slice(separatorIndex + 2);
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
  }
}

/**
 * try to parse talkerId and content for generic room messages
 * @param padLocalMessage
 * @param ret
 * @param context
 */
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
