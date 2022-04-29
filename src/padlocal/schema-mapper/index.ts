/* eslint-disable sort-keys */
/* eslint-disable brace-style */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import {
  type ChatRoomMember,
  Contact,
  type Message,
} from "padlocal-client-ts/dist/proto/padlocal_pb";
import * as PUPPET from "wechaty-puppet";
import { log } from "wechaty-puppet";
import { isContactId, isContactOfficialId, isIMContactId, isIMRoomId, isRoomId } from "../utils/is-type";
import { convertMessageType } from "../message-parser/helpers/message";
import { appMessageParser, AppMessageType } from "../message-parser/helpers/message-appmsg";
import type { WechatMessageType } from "../message-parser/WechatMessageType";
import { parseMessagePatPayload } from "../message-parser/helpers/message-pat";

const PRE = "[SchemaMapper]";

export async function padLocalMessageToWechaty(puppet: PUPPET.Puppet, padLocalMessage: Message.AsObject): Promise<PUPPET.payloads.Message> {
  const wechatMessageType = padLocalMessage.type as WechatMessageType;
  const type = convertMessageType(wechatMessageType);

  /**
   * single chat message: talkerId + listenerId
   * room message: talkerId + roomId
   */
  let talkerId: string = "";
  let roomId: undefined | string;
  let listenerId: undefined | string;
  let text: string = padLocalMessage.content;

  // room message sent by others
  if (isRoomId(padLocalMessage.fromusername) || isIMRoomId(padLocalMessage.fromusername)) {
    roomId = padLocalMessage.fromusername;

    // text:    "wxid_xxxx:\nnihao"
    // appmsg:  "wxid_xxxx:\n<?xml version="1.0"?><msg><appmsg appid="" sdkver="0">..."
    // pat:     "19850419xxx@chatroom:\n<sysmsg type="pat"><pat><fromusername>xxx</fromusername><chatusername>19850419xxx@chatroom</chatusername><pattedusername>wxid_xxx</pattedusername>...<template><![CDATA["${vagase}" 拍了拍我]]></template></pat></sysmsg>"

    // separator of talkerId and content
    const separatorIndex = padLocalMessage.content.indexOf(":\n");
    if (separatorIndex !== -1) {
      const takerIdPrefix = padLocalMessage.content.slice(0, separatorIndex);
      // chat message
      if (isContactId(takerIdPrefix) || isIMContactId(takerIdPrefix)) {
        text = padLocalMessage.content.slice(separatorIndex + 2);
        talkerId = takerIdPrefix;
      }
      // pat and other system message
      else if (isRoomId(takerIdPrefix) || isIMRoomId(takerIdPrefix)) {
        text = padLocalMessage.content.slice(separatorIndex + 2);

        // extract talkerId for pat message from payload
        const patMessagePayload = await parseMessagePatPayload(padLocalMessage);
        if (patMessagePayload) {
          talkerId = patMessagePayload.fromusername;
        }
        else {
          // FIXME: extract talkerId for other 10002 messages
        }
      }
    }
  }
  // room message sent by self
  else if (isRoomId(padLocalMessage.tousername) || isIMRoomId(padLocalMessage.tousername)) {
    roomId = padLocalMessage.tousername;
    talkerId = padLocalMessage.fromusername;

    const startIndex = padLocalMessage.content.indexOf(":\n");
    text = padLocalMessage.content.slice(startIndex !== -1 ? startIndex + 2 : 0);
  }
  // single chat message
  else {
    talkerId = padLocalMessage.fromusername;
    listenerId = padLocalMessage.tousername;
  }

  /**
   * 7. Set text for quote message
   */
  // TODO:
  /*
  if (rawPayload.appMsgType === WechatAppMessageType.QuoteMessage) {
    text = await quotePayloadParser(rawPayload);
  }
   */

  const messageBase: PUPPET.payloads.MessageBase = {
    id: padLocalMessage.id,
    talkerId,
    text,
    timestamp: padLocalMessage.createtime,
    type
  };

  let message: PUPPET.payloads.Message;

  // room message
  if (roomId) {
    let mentionIdList: string[] = [];
    if (padLocalMessage.atList.length === 1 && padLocalMessage.atList[0] === "announcement@all") {
      const roomPayload = await puppet.roomPayload(roomId);
      mentionIdList = roomPayload.memberIdList;
    } else {
      mentionIdList = padLocalMessage.atList;
    }

    const messageRoom: PUPPET.payloads.MessageRoom = {
      roomId,
      mentionIdList
    };

    message = {
      ...messageBase,
      ...messageRoom
    };
  }

  // normal single chat message
  else if (listenerId) {
    const messageTo: PUPPET.payloads.MessageTo = {
      listenerId
    };

    message = {
      ...messageBase,
      ...messageTo
    };
  }

  else {
    throw new Error("neither toId nor roomId");
  }

  await _adjustMessageByAppMsg(padLocalMessage, message);

  return message;
}

export function padLocalContactToWechaty(contact: Contact.AsObject): PUPPET.payloads.Contact {
  return {
    id: contact.username,
    gender: contact.gender,
    type: isContactOfficialId(contact.username) ? PUPPET.types.Contact.Official : PUPPET.types.Contact.Individual,
    name: contact.nickname,
    avatar: contact.avatar,
    alias: contact.remark,
    weixin: contact.alias,
    city: contact.city,
    friend: !contact.stranger,
    province: contact.province,
    signature: contact.signature,
    phone: contact.phoneList,
  };
}

export function padLocalRoomToWechaty(contact: Contact.AsObject): PUPPET.payloads.Room {
  return {
    adminIdList: [],
    avatar: contact.avatar,
    id: contact.username,
    memberIdList: contact.chatroommemberList.map((member) => member.username),
    ownerId: contact.chatroomownerusername,
    topic: contact.nickname,
  };
}

export function padLocalRoomMemberToWechaty(chatRoomMember: ChatRoomMember.AsObject): PUPPET.payloads.RoomMember {
  return {
    id: chatRoomMember.username,
    roomAlias: chatRoomMember.displayname,
    inviterId: chatRoomMember.inviterusername,
    avatar: chatRoomMember.avatar,
    name: chatRoomMember.nickname,
  };
}

async function _adjustMessageByAppMsg(message: Message.AsObject, payload: PUPPET.payloads.Message) {
  if (payload.type !== PUPPET.types.Message.Attachment) {
    return;
  }

  try {
    const appPayload = await appMessageParser(message);
    switch (appPayload.type) {
      case AppMessageType.Text:
        payload.type = PUPPET.types.Message.Text;
        payload.text = appPayload.title;
        break;
      case AppMessageType.Audio:
        payload.type = PUPPET.types.Message.Url;
        break;
      case AppMessageType.Video:
        payload.type = PUPPET.types.Message.Url;
        break;
      case AppMessageType.Url:
        payload.type = PUPPET.types.Message.Url;
        break;
      case AppMessageType.Attach:
        payload.type = PUPPET.types.Message.Attachment;
        payload.filename = appPayload.title;
        break;
      case AppMessageType.ChatHistory:
        payload.type = PUPPET.types.Message.ChatHistory;
        break;
      case AppMessageType.MiniProgram:
      case AppMessageType.MiniProgramApp:
        payload.type = PUPPET.types.Message.MiniProgram;
        break;
      case AppMessageType.RedEnvelopes:
        payload.type = PUPPET.types.Message.RedEnvelope;
        break;
      case AppMessageType.Transfers:
        payload.type = PUPPET.types.Message.Transfer;
        break;
      case AppMessageType.RealtimeShareLocation:
        payload.type = PUPPET.types.Message.Location;
        break;
      case AppMessageType.GroupNote:
        payload.type = PUPPET.types.Message.GroupNote;
        payload.text = appPayload.title;
        break;
      case AppMessageType.ReferMsg:
        payload.type = PUPPET.types.Message.Text;
        payload.text = `「${appPayload.refermsg!.displayname}：${
          appPayload.refermsg!.content
        }」\n- - - - - - - - - - - - - - - -\n${appPayload.title}`;
        break;
      default:
        payload.type = PUPPET.types.Message.Unknown;
        break;
    }
  } catch (e) {
    log.warn(PRE, `Error occurred while parse message attachment: ${JSON.stringify(message)} , ${(e as Error).stack}`);
  }
}

export function chatRoomMemberToContact(chatRoomMember: ChatRoomMember): Contact {
  return new Contact()
    .setUsername(chatRoomMember.getUsername())
    .setNickname(chatRoomMember.getNickname())
    .setAvatar(chatRoomMember.getAvatar())
    .setStranger(true);
}
