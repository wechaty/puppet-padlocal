import { ChatRoomMember, Contact, Message } from "padlocal-client-ts/dist/proto/padlocal_pb";
import {
  ContactPayload,
  ContactType,
  MessagePayload,
  MessageType,
  RoomMemberPayload,
  RoomPayload,
} from "wechaty-puppet";
import { isContactOfficialId, isRoomId } from "../utils/is-type";
import { WechatMessageType } from "wechaty-puppet/dist/src/schemas/message";
import { convertMessageType } from "../message-parser/helpers/message";
import { appMessageParser, AppMessageType } from "../message-parser/helpers/message-appmsg";
import { log } from "wechaty";

const PRE = "[SchemaMapper]";

export async function padLocalMessageToWechaty(message: Message.AsObject): Promise<MessagePayload> {
  const wechatMessageType = message.type as WechatMessageType;
  const type = convertMessageType(wechatMessageType);

  let roomId: string | undefined;
  if (isRoomId(message.fromusername)) {
    roomId = message.fromusername;
  }
  if (isRoomId(message.tousername)) {
    roomId = message.tousername;
  }

  const payload: MessagePayload = {
    id: message.id,
    text: message.content,
    timestamp: message.createtime,
    type,
    fromId: message.fromusername,
    toId: message.tousername,
    roomId,
    mentionIdList: message.atList,
  };

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
    alias: contact.alias,
    city: contact.city,
    friend: !contact.stranger,
    province: contact.province,
    signature: contact.signature,
    // weixin: TODO
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
