import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import * as PUPPET from "wechaty-puppet";
import { log } from "wechaty-puppet";
import {
  parseAppmsgMessagePayload,
  AppMessagePayload,
  AppMessageType,
  ReferMsgPayload,
} from "../message-parser/payload/message-appmsg.js";
import { convertWechatMessageTypeToPuppet, WechatMessageType } from "../message-parser/type.js";
import { isIMRoomId, isRoomId } from "../utils/is-type.js";
import {
  fixPayloadForRoomMessageSentByOthers,
  parseContactFromRoomMessageContent,
} from "../message-parser/payload/message-room.js";

const PRE = "[SchemaMapper]";

export async function padLocalMessageToWechaty(puppet: PUPPET.Puppet, padLocalMessage: PadLocal.Message.AsObject): Promise<PUPPET.payloads.Message> {
  const wechatMessageType = padLocalMessage.type as WechatMessageType;
  const type = convertWechatMessageTypeToPuppet(wechatMessageType, padLocalMessage);

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
    } else {
      /**
       * Message that can not get talkerId from payload:
       * 1. Create room with users that have deleted you: https://gist.github.com/padlocal/e95f8e05eb00556317991964eecfd150
       *
       * But talkerId is required by Wechaty, or exception will be raised:
       * https://github.com/wechaty/wechaty/blob/435cefd90baf7f2a0c801010132e74f9e0575fc2/src/user-modules/message.ts#L813
       * Solution: we set talkerId to fromusername, treating these kinds of messages are sent by self.
       */
      talkerId = padLocalMessage.tousername;
    }
  } else if (isRoomId(padLocalMessage.tousername) || isIMRoomId(padLocalMessage.tousername)) {
    // room message sent by self

    roomId = padLocalMessage.tousername;
    talkerId = padLocalMessage.fromusername;

    const startIndex = padLocalMessage.content.indexOf(":\n");
    text = padLocalMessage.content.slice(startIndex !== -1 ? startIndex + 2 : 0);

    // try to parse listenerId for messages, e.g. pat message
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
      const referMessageAppPayload = await parseAppmsgMessagePayload(referMessagePayload.content);
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
    const appPayload = await parseAppmsgMessagePayload(message.content);
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
