import PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import * as PUPPET from "wechaty-puppet";
import { log } from "wechaty-puppet";
import { isContactOfficialId, isIMRoomId, isRoomId } from "../utils/is-type.js";
import { convertMessageType } from "../message-parser/helpers/message.js";
import {
  appMessageParser,
  AppMessagePayload,
  AppMessageType,
  ReferMsgPayload,
} from "../message-parser/helpers/message-appmsg.js";
import { WechatMessageType } from "../message-parser/WechatMessageType.js";
import {
  fixPayloadForRoomMessageSentByOthers,
  parseContactFromRoomMessageContent
} from "../message-parser/helpers/message-room.js";

const PRE = "[SchemaMapper]";

export async function padLocalMessageToWechaty(puppet: PUPPET.Puppet, padLocalMessage: PadLocal.Message.AsObject): Promise<PUPPET.payloads.Message> {
  const wechatMessageType = padLocalMessage.type as WechatMessageType;
  const type = convertMessageType(wechatMessageType);

  /**
   * single chat message: talkerId + listenerId
   * room message: talkerId + roomId + listenerId(optional)
   */
  let talkerId: string = "";
  let roomId: undefined | string;
  let listenerId: undefined | string;
  let text: string = padLocalMessage.content;

  if (isRoomId(padLocalMessage.fromusername) || isIMRoomId(padLocalMessage.fromusername)) {
    // room message sent by others

    roomId = padLocalMessage.fromusername;
    const payload = await fixPayloadForRoomMessageSentByOthers(padLocalMessage);
    if (payload) {
      text = payload.text;
      talkerId = payload.talkerId;
      listenerId = payload.listenerId;
    }
  } else if (isRoomId(padLocalMessage.tousername) || isIMRoomId(padLocalMessage.tousername)) {
    // room message sent by self

    roomId = padLocalMessage.tousername;
    talkerId = padLocalMessage.fromusername;

    const startIndex = padLocalMessage.content.indexOf(":\n");
    text = padLocalMessage.content.slice(startIndex !== -1 ? startIndex + 2 : 0);

    const contactInfo = await parseContactFromRoomMessageContent(padLocalMessage);
    listenerId = contactInfo?.listenerId;
  } else {
    // single chat message

    talkerId = padLocalMessage.fromusername;
    listenerId = padLocalMessage.tousername;
  }

  const messageBase: PUPPET.payloads.MessageBase = {
    id: padLocalMessage.id,
    talkerId,
    text,
    timestamp: padLocalMessage.createtime,
    type,
  };

  let message: PUPPET.payloads.Message;

  if (roomId) {
    // room message

    let mentionIdList: string[];
    if (padLocalMessage.atList.length === 1 && padLocalMessage.atList[0] === "announcement@all") {
      const roomPayload = await puppet.roomPayload(roomId);
      mentionIdList = roomPayload.memberIdList;
    } else {
      mentionIdList = padLocalMessage.atList;
    }

    const messageRoom: PUPPET.payloads.MessageRoom = {
      listenerId,
      mentionIdList,
      roomId,
    };

    message = {
      ...messageBase,
      ...messageRoom,
    };
  } else if (listenerId) {
    // normal single chat message

    const messageTo: PUPPET.payloads.MessageTo = {
      listenerId,
    };

    message = {
      ...messageBase,
      ...messageTo,
    };
  } else {
    throw new Error("neither toId nor roomId");
  }

  await _adjustMessageByAppMsg(padLocalMessage, message);

  return message;
}

export function padLocalContactToWechaty(contact: PadLocal.Contact.AsObject): PUPPET.payloads.Contact {
  return {
    alias: contact.remark,
    avatar: contact.avatar,
    city: contact.city,
    friend: !contact.stranger,
    gender: contact.gender,
    id: contact.username,
    name: contact.nickname,
    phone: contact.phoneList,
    province: contact.province,
    signature: contact.signature,
    type: isContactOfficialId(contact.username) ? PUPPET.types.Contact.Official : PUPPET.types.Contact.Individual,
    weixin: contact.alias,
  };
}

export function padLocalRoomToWechaty(contact: PadLocal.Contact.AsObject): PUPPET.payloads.Room {
  return {
    adminIdList: [],
    avatar: contact.avatar,
    id: contact.username,
    memberIdList: contact.chatroommemberList.map((member) => member.username),
    ownerId: contact.chatroomownerusername,
    topic: contact.nickname,
  };
}

export function padLocalRoomMemberToWechaty(chatRoomMember: PadLocal.ChatRoomMember.AsObject): PUPPET.payloads.RoomMember {
  return {
    avatar: chatRoomMember.avatar,
    id: chatRoomMember.username,
    inviterId: chatRoomMember.inviterusername,
    name: chatRoomMember.nickname,
    roomAlias: chatRoomMember.displayname,
  };
}

async function _processReferMessage(appPayload: AppMessagePayload, payload: PUPPET.payloads.Message) {
  let referMessageContent: string;

  const referMessagePayload: ReferMsgPayload = appPayload.refermsg!;
  const referMessageType = parseInt(referMessagePayload.type) as WechatMessageType;
  switch (referMessageType) {
    case WechatMessageType.Text:
      referMessageContent = referMessagePayload.content;
      break;
    case WechatMessageType.Image:
      referMessageContent = "图片";
      break;

    case WechatMessageType.Video:
      referMessageContent = "视频";
      break;

    case WechatMessageType.Emoticon:
      referMessageContent = "动画表情";
      break;

    case WechatMessageType.Location:
      referMessageContent = "位置";
      break;

    case WechatMessageType.App: {
      const referMessageAppPayload = await appMessageParser(referMessagePayload.content);
      referMessageContent = referMessageAppPayload.title;
      break;
    }

    default:
      referMessageContent = "未知消息";
      break;
  }

  payload.type = PUPPET.types.Message.Text;
  payload.text = `${appPayload.title}\n「${referMessagePayload.displayname}：${referMessageContent}」`;
}

async function _adjustMessageByAppMsg(message: PadLocal.Message.AsObject, payload: PUPPET.payloads.Message) {
  if (payload.type !== PUPPET.types.Message.Attachment) {
    return;
  }

  try {
    const appPayload = await appMessageParser(message.content);
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
        await _processReferMessage(appPayload, payload);
        break;
      default:
        payload.type = PUPPET.types.Message.Unknown;
        break;
    }
  } catch (e) {
    log.warn(PRE, `Error occurred while parse message attachment: ${JSON.stringify(message)} , ${(e as Error).stack}`);
  }
}

export function chatRoomMemberToContact(chatRoomMember: PadLocal.ChatRoomMember): PadLocal.Contact {
  return new PadLocal.Contact()
    .setUsername(chatRoomMember.getUsername())
    .setNickname(chatRoomMember.getNickname())
    .setAvatar(chatRoomMember.getAvatar())
    .setStranger(true);
}
