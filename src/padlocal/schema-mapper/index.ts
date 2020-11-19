import { ChatRoomMember, Contact, Message } from "padlocal-client-ts/dist/proto/padlocal_pb";
import {
  ContactPayload,
  ContactType,
  MessagePayload,
  MessageType,
  RoomMemberPayload,
  RoomPayload,
} from "wechaty-puppet";
import { isContactId, isContactOfficialId, isIMContactId, isIMRoomId, isRoomId } from "../utils/is-type";
import { MessagePayloadBase, WechatMessageType } from "wechaty-puppet/dist/src/schemas/message";
import { convertMessageType } from "../message-parser/helpers/message";
import { appMessageParser, AppMessageType } from "../message-parser/helpers/message-appmsg";
import { log } from "wechaty";

const PRE = "[SchemaMapper]";

export async function padLocalMessageToWechaty(message: Message.AsObject): Promise<MessagePayload> {
  const wechatMessageType = message.type as WechatMessageType;
  const type = convertMessageType(wechatMessageType);

  const payloadBase: MessagePayloadBase = {
    id: message.id,
    timestamp: message.createtime,
    type,
  };

  let fromId: undefined | string;
  let roomId: undefined | string;
  let toId: undefined | string;

  let text: undefined | string;
  let mentionIdList: string[] = [];

  /**
   * 1. Set Room Id
   */
  if (isRoomId(message.fromusername)) {
    roomId = message.fromusername;
  } else if (isRoomId(message.tousername)) {
    roomId = message.tousername;
  } else if (isIMRoomId(message.fromusername)) {
    roomId = message.fromusername;
  } else if (isIMRoomId(message.tousername)) {
    roomId = message.tousername;
  } else {
    roomId = undefined;
  }

  /**
   * 2. Set To Contact Id
   */
  if (isContactId(message.tousername)) {
    toId = message.tousername;
  } else {
    // TODO: if the message @someone, the toId should set to the mentioned contact id(?)

    toId = undefined;
  }

  /**
   * 3. Set From Contact Id
   */
  if (isContactId(message.fromusername)) {
    fromId = message.fromusername;
  } else {
    const parts = message.content.split(":\n");
    if (parts && parts.length > 1) {
      if (isContactId(parts[0])) {
        fromId = parts[0];
      } else if (isIMContactId(parts[0])) {
        fromId = parts[0];
      }
    } else {
      fromId = undefined;
    }
  }

  /**
   *
   * 4. Set Text
   */
  if (roomId) {
    const startIndex = message.content.indexOf(":\n");

    text = message.content.slice(startIndex !== -1 ? startIndex + 2 : 0);
  } else if (isContactId(message.fromusername)) {
    text = message.content;
  }

  /**
   * 5.1 Validate Room & From ID
   */
  if (!roomId && !fromId) {
    throw Error("empty roomId and empty fromId!");
  }
  /**
   * 5.1 Validate Room & To ID
   */
  if (!roomId && !toId) {
    throw Error("empty roomId and empty toId!");
  }

  /**
   * 6. Set mention list, only for room messages
   */
  if (roomId) {
    mentionIdList = message.atList;
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

  let payload: MessagePayload;

  // Two branch is the same code.
  // Only for making TypeScript happy
  if (fromId && toId) {
    payload = {
      ...payloadBase,
      fromId,
      mentionIdList,
      roomId,
      text,
      toId,
    };
  } else if (roomId) {
    payload = {
      ...payloadBase,
      fromId,
      mentionIdList,
      roomId,
      text,
      toId,
    };
  } else {
    throw new Error("neither toId nor roomId");
  }

  await _adjustMessageByAppMsg(message, payload);

  return payload;
}

export function padLocalContactToWechaty(contact: Contact.AsObject): ContactPayload {
  return {
    id: contact.username,
    gender: contact.gender,
    type: isContactOfficialId(contact.username) ? ContactType.Official : ContactType.Unknown,
    name: contact.nickname,
    avatar: contact.avatar,
    alias: contact.remark,
    weixin: contact.alias,
    city: contact.city,
    friend: !contact.stranger,
    province: contact.province,
    signature: contact.signature,
    phone: [],
  };
}

export function padLocalRoomToWechaty(contact: Contact.AsObject): RoomPayload {
  return {
    adminIdList: [],
    avatar: contact.avatar,
    id: contact.username,
    memberIdList: contact.chatroommemberList.map((member) => member.username),
    ownerId: contact.chatroomownerusername,
    topic: contact.nickname,
  };
}

export function padLocalRoomMemberToWechaty(chatRoomMember: ChatRoomMember.AsObject): RoomMemberPayload {
  return {
    id: chatRoomMember.username,
    roomAlias: chatRoomMember.displayname,
    inviterId: chatRoomMember.inviterusername,
    avatar: chatRoomMember.avatar,
    name: chatRoomMember.nickname,
  };
}

async function _adjustMessageByAppMsg(message: Message.AsObject, payload: MessagePayload) {
  if (payload.type !== MessageType.Attachment) {
    return;
  }

  try {
    const appPayload = await appMessageParser(message);
    switch (appPayload.type) {
      case AppMessageType.Text:
        payload.type = MessageType.Text;
        payload.text = appPayload.title;
        break;
      case AppMessageType.Url:
        payload.type = MessageType.Url;
        break;
      case AppMessageType.Attach:
        payload.type = MessageType.Attachment;
        payload.filename = appPayload.title;
        break;
      case AppMessageType.ChatHistory:
        payload.type = MessageType.ChatHistory;
        break;
      case AppMessageType.MiniProgram:
      case AppMessageType.MiniProgramApp:
        payload.type = MessageType.MiniProgram;
        break;
      case AppMessageType.RedEnvelopes:
        payload.type = MessageType.RedEnvelope;
        break;
      case AppMessageType.Transfers:
        payload.type = MessageType.Transfer;
        break;
      case AppMessageType.RealtimeShareLocation:
        payload.type = MessageType.Location;
        break;
      case AppMessageType.GroupNote:
        payload.type = MessageType.GroupNote;
        payload.text = appPayload.title;
        break;
      default:
        payload.type = MessageType.Unknown;
        break;
    }
  } catch (e) {
    log.warn(PRE, `Error occurred while parse message attachment: ${e.stack}`);
  }
}

export function chatRoomMemberToContact(chatRoomMember: ChatRoomMember): Contact {
  return new Contact()
    .setUsername(chatRoomMember.getUsername())
    .setNickname(chatRoomMember.getNickname())
    .setAvatar(chatRoomMember.getAvatar());
}
