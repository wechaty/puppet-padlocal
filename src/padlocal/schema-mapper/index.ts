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
import { isPatMessage, patMessageParser } from "../message-parser/helpers/message-pat";

const PRE = "[SchemaMapper]";

export async function padLocalMessageToWechaty(puppet: PUPPET.Puppet, padLocalMessage: Message.AsObject): Promise<PUPPET.payloads.Message> {
  const wechatMessageType = padLocalMessage.type as WechatMessageType;
  const type = convertMessageType(wechatMessageType);

  /**
   * fromId: is mandatory
   * roomId: is mandatory if message is room message
   * listenerId: is mandatory if message is single chat message
   */
  let talkerId: string = "";
  let roomId: undefined | string;
  let listenerId: undefined | string;
  let text: string = padLocalMessage.content;

  // enterprise wechat
  if (isRoomId(padLocalMessage.fromusername) || isIMRoomId(padLocalMessage.fromusername)) {
    roomId = padLocalMessage.fromusername;

    // text:    "wxid_xxxx:\nnihao"
    // appmsg:  "wxid_xxxx:\n<?xml version="1.0"?><msg><appmsg appid="" sdkver="0">..."
    // pat:     "19850419xxx@chatroom:\n<sysmsg type="pat"><pat><fromusername>xxx</fromusername><chatusername>19850419xxx@chatroom</chatusername><pattedusername>wxid_xxx</pattedusername>...<template><![CDATA["${vagase}" 拍了拍我]]></template></pat></sysmsg>"

    /**
     * Issue #91 - messageForward can not forward text with ":\n" correctly. #91
     *  @link https://github.com/wechaty/puppet-padlocal/issues/91
     *
     * TODO: fix me
     */
    const parts = padLocalMessage.content.split(":\n");
    if (parts && parts.length > 1) {
      if (isContactId(parts[0]) || isIMContactId(parts[0])) {
        talkerId = parts[0] as string;
        text = parts[1] as string;
      }
      // pat message
      else if (isRoomId(parts[0]) || isIMRoomId(parts[0])) {
        const patMessage = await isPatMessage(padLocalMessage);
        if (patMessage) {
          const patMessagePayload = await patMessageParser(padLocalMessage);
          talkerId = patMessagePayload.fromusername;
          text = patMessagePayload.template;
        }
      }
    }
  } else if (isRoomId(padLocalMessage.tousername) || isIMRoomId(padLocalMessage.tousername)) {
    roomId = padLocalMessage.tousername;
    talkerId = padLocalMessage.fromusername;

    const startIndex = padLocalMessage.content.indexOf(":\n");
    text = padLocalMessage.content.slice(startIndex !== -1 ? startIndex + 2 : 0);
  } else {
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
