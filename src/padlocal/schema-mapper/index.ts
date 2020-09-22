import { ChatRoomMember, Contact, Message } from "padlocal-client-ts/dist/proto/padlocal_pb";
import {
  ContactPayload,
  ContactType,
  MessagePayload,
  MessageType,
  RoomMemberPayload,
  RoomPayload,
} from "wechaty-puppet";
import { isContactId, isContactOfficialId, isRoomId } from "../utils/is-type";
import { MessagePayloadBase, MessagePayloadRoom, WechatMessageType } from "wechaty-puppet/dist/src/schemas/message";
import { convertMessageType } from "../message-parser/helpers/message";
import { appMessageParser, AppMessageType } from "../message-parser/helpers/message-appmsg";
import { log } from "wechaty";
import { MessagePayloadTo } from "wechaty-puppet/src/schemas/message";

const PRE = "[SchemaMapper]";

export async function padLocalMessageToWechaty(message: Message.AsObject): Promise<MessagePayload> {
  const wechatMessageType = message.type as WechatMessageType;
  const type = convertMessageType(wechatMessageType);

  const payloadBase: MessagePayloadBase = {
    id: message.id,
    timestamp: message.createtime,
    type,
    text: message.content,
  };

  let fromId: undefined | string;
  let roomId: undefined | string;
  let toId: undefined | string;

  if (isRoomId(message.fromusername)) {
    roomId = message.fromusername;
  }
  if (isRoomId(message.tousername)) {
    roomId = message.tousername;
  }

  if (isContactId(message.tousername)) {
    toId = message.tousername;
  }

  if (isContactId(message.fromusername)) {
    fromId = message.fromusername;
  }

  let payload: MessagePayload;

  // none-room message
  if (fromId && toId) {
    const payloadTo: MessagePayloadTo = {
      fromId,
      toId,
    };
    payload = {
      ...payloadBase,
      ...payloadTo,
    };
  }
  // room message: roomId & (fromId | toId)
  else if (roomId) {
    const payloadRoom: MessagePayloadRoom = {
      roomId,
      fromId,
      toId,
      mentionIdList: message.atList,
    };
    payload = {
      ...payloadBase,
      ...payloadRoom,
    };
  } else {
    throw new Error("neither toId nor roomId");
  }

  await _adjustMessageTypeByAppMsg(message, payload);

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

async function _adjustMessageTypeByAppMsg(message: Message.AsObject, payload: MessagePayload) {
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
