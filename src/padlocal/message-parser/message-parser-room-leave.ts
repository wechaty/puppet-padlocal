/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import * as PUPPET from "wechaty-puppet";
import type { RoomXmlSchema } from "./helpers/message-room.js";
import { isRoomId } from "../utils/is-type.js";
import { getUserName } from "../utils/get-xml-label.js";
import { xmlToJson } from "../utils/xml-to-json.js";
import type { MessageParserRetType } from "./message-parser.js";

const ROOM_LEAVE_OTHER_REGEX_LIST = [/^(You) removed "(.+)" from the group chat/, /^(你)将"(.+)"移出了群聊/];
const ROOM_LEAVE_BOT_REGEX_LIST = [/^(You) were removed from the group chat by "([^"]+)"/, /^(你)被"([^"]+?)"移出群聊/];

const roomLeaveDebounceMap: Map<string, ReturnType<typeof setTimeout>> = new Map();
const DEBOUNCE_TIMEOUT = 3600 * 1000; // 1 hour

function roomLeaveDebounceKey(roomId: string, removeeId: string) {
  return `${roomId}:${removeeId}`;
}

function roomLeaveAddDebounce(roomId: string, removeeId: string) {
  const key = roomLeaveDebounceKey(roomId, removeeId);
  const oldTimeout = roomLeaveDebounceMap.get(key);
  if (oldTimeout) {
    clearTimeout(oldTimeout);
  }

  const timeout = setTimeout(() => {
    roomLeaveDebounceMap.delete(key);
  }, DEBOUNCE_TIMEOUT);
  roomLeaveDebounceMap.set(key, timeout);
}

// to fix: https://github.com/padlocal/wechaty-puppet-padlocal/issues/43
export function removeRoomLeaveDebounce(roomId: string, removeeId: string) {
  const key = roomLeaveDebounceKey(roomId, removeeId);
  roomLeaveDebounceMap.delete(key);
}

export function isRoomLeaveDebouncing(roomId: string, removeeId: string): boolean {
  const key = roomLeaveDebounceKey(roomId, removeeId);
  return roomLeaveDebounceMap.get(key) !== undefined;
}

export default async(puppet: PUPPET.Puppet, message: PadLocal.Message.AsObject): Promise<MessageParserRetType> => {
  const roomId = message.fromusername;
  if (!isRoomId(roomId)) {
    return null;
  }

  let content = message.content;
  let linkList;

  const needParseXML = content.includes("移出群聊") || content.includes("You were removed from the group chat by");
  if (!needParseXML) {
    const roomXml: RoomXmlSchema = await xmlToJson(content);
    if (!roomXml || !roomXml.sysmsg || !roomXml.sysmsg.sysmsgtemplate) {
      return null;
    }

    content = roomXml.sysmsg.sysmsgtemplate.content_template.template;
    linkList = roomXml.sysmsg.sysmsgtemplate.content_template.link_list.link;
  }

  let matchesForOther: null | string[] = [];
  ROOM_LEAVE_OTHER_REGEX_LIST.some((regex) => !!(matchesForOther = content.match(regex)));

  let matchesForBot: null | string[] = [];
  ROOM_LEAVE_BOT_REGEX_LIST.some((re) => !!(matchesForBot = content.match(re)));

  const matches = matchesForOther || matchesForBot;
  if (!matches) {
    return null;
  }

  let leaverId: string;
  let removerId: string;

  if (matchesForOther) {
    removerId = (await puppet.roomMemberSearch(roomId, PUPPET.types.YOU))[0]!;
    const leaverName = matchesForOther[2]!;
    leaverId = getUserName([linkList], leaverName);
  } else if (matchesForBot) {
    removerId = matchesForBot[2]!;
    leaverId = (await puppet.roomMemberSearch(roomId, PUPPET.types.YOU))[0]!;
  } else {
    throw new Error("for typescript type checking, will never go here");
  }

  roomLeaveAddDebounce(roomId, leaverId);

  return {
    removeeIdList: [leaverId],
    removerId,
    roomId,
    timestamp: message.createtime,
  } as PUPPET.payloads.EventRoomLeave;
};
