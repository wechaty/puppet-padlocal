/* eslint-disable camelcase */
import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import { parseSysmsgMessagePayload } from "./message-sysmsg.js";
import type { PatMessagePayload } from "./sysmsg/message-pat.js";
import { isContactId, isIMContactId, isIMRoomId, isRoomId } from "../../utils/is-type.js";
import { log } from "wechaty";

export interface RoomXmlSchema {
  sysmsg: {
    $: {
      type: string;
    };
    sysmsgtemplate: {
      content_template: {
        $: {
          type: string;
        };
        plain: string;
        template: string;
        link_list: {
          link: [
            {
              $: {
                name: string;
                type: string;
                hidden?: string;
              };
              memberlist?: {
                member: [
                  {
                    username: string;
                    nickname: string;
                  }
                ];
              };
              separator?: string;
              title?: string;
              usernamelist?: {
                username: string;
              };
            }
          ];
        };
      };
    };
  };
}

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
    }
  }

  return ret;
}

interface RoomMessageSentByOthersFixedPayload {
  talkerId: string,
  listenerId?: string
  text: string,
}

/**
 * Two reason for this method:
 *
 * 1. The fromuser for room message which sent by others is always the roomId,
 * so we need to extract real talkerId and listenerId(optional) from message content
 *
 * 2. Room message sent by others is always prefixed with talkerId(e.g. chat message), or roomId(e.g. system message 10002),
 * so we need to remove the prefix to get right content.
 * @param padLocalMessage
 */
export async function fixPayloadForRoomMessageSentByOthers(padLocalMessage: PadLocal.Message.AsObject) : Promise<RoomMessageSentByOthersFixedPayload | undefined> {
  let ret: RoomMessageSentByOthersFixedPayload | undefined;

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
    if (isContactId(takerIdPrefix) || isIMContactId(takerIdPrefix)) {
      // chat message
      ret = {
        talkerId: takerIdPrefix,
        text : padLocalMessage.content.slice(separatorIndex + 2),
      };
    } else if (isRoomId(takerIdPrefix) || isIMRoomId(takerIdPrefix)) {
      // pat/todo and other system message

      const contactInfo = await parseContactFromRoomMessageContent(padLocalMessage);

      let talkerId = contactInfo?.talkerId;
      // Fallback strategy: use takerIdPrefix as talkerId for other room system messages
      if (!talkerId) {
        talkerId = takerIdPrefix;
      }

      ret = {
        listenerId: contactInfo?.listenerId,
        talkerId,
        text: padLocalMessage.content.slice(separatorIndex + 2),
      };
    }
  } else {
    // suppose never happen
    log.error(`No contact prefix is found for room message sent by others: ${JSON.stringify(padLocalMessage)}`);
  }

  return ret;
}
