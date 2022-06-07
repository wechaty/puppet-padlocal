import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import type * as PUPPET from "wechaty-puppet";
import { isRoomId } from "../utils/is-type.js";
import type { EventPayload } from "./event.js";
import { parseSysmsgSysmsgTemplateMessagePayload } from "../messages/message-sysmsg.js";
import {
  parseSysmsgTemplate, SysmsgTemplateLinkProfile,
} from "../messages/sysmsg/message-sysmsgtemplate.js";
import { WechatMessageType } from "../types.js";
import { executeRunners } from "../utils/runner.js";

const YOU_REMOVE_OTHER_REGEX_LIST = [
  /^(你)将"(.+)"移出了群聊/,
  /^(You) removed "(.+)" from the group chat/,
];
const OTHER_REMOVE_YOU_REGEX_LIST = [
  /^(你)被"([^"]+?)"移出群聊/,
  /^(You) were removed from the group chat by "([^"]+)"/,
];

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

export default async(puppet: PUPPET.Puppet, message: PadLocal.Message.AsObject): Promise<EventPayload> => {
  const roomId = message.fromusername;
  if (!isRoomId(roomId)) {
    return null;
  }

  /**
   * 1. 我将别人移除
   * /^(你)将"(.+)"移出了群聊/,
   *  我移除别人是 10002: https://gist.github.com/padlocal/5676b96ad0ca918fdd53849417eff422
   */
  const youRemoveOther = async() => {
    const sysmsgTemplatePayload = await parseSysmsgSysmsgTemplateMessagePayload(message);
    if (!sysmsgTemplatePayload) {
      return null;
    }

    return await parseSysmsgTemplate<PUPPET.payloads.EventRoomLeave>(
      sysmsgTemplatePayload,
      YOU_REMOVE_OTHER_REGEX_LIST,
      async(templateLinkList) => {
        // the first item MUST be removed profile link
        const removeeList = templateLinkList[0]!.payload as SysmsgTemplateLinkProfile;
        // filter other empty userName, in case the user is not your friend
        const removeeIdList = removeeList.map(m => m.userName).filter(s => !!s);
        return {
          removeeIdList,
          removerId: puppet.currentUserId,
          roomId,
          timestamp: message.createtime,
        } as PUPPET.payloads.EventRoomLeave;
      });
  };

  /**
   * 2. 别人移除我
   * /^(你)被"([^"]+?)"移出群聊/,
   * // 我被别人移除是 10000：https://gist.github.com/padlocal/60be89334d4d743937f07023da20291e
   */
  const otherRemoveYou = async() => {
    if (message.type !== WechatMessageType.Sys) {
      return null;
    }

    let matches: null | string[] = null;
    OTHER_REMOVE_YOU_REGEX_LIST.some((re) => !!(matches = message.content.match(re)));

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (matches) {
      const removerName = matches[2]!;
      const removerId = (await puppet.roomMemberSearch(roomId, removerName))[0]!;

      return {
        removeeIdList: [puppet.currentUserId],
        removerId,
        roomId,
        timestamp: message.createtime,
      } as PUPPET.payloads.EventRoomLeave;
    }

    return null;
  };

  const ret = await executeRunners<PUPPET.payloads.EventRoomLeave>([youRemoveOther, otherRemoveYou]);
  if (ret) {
    ret.removeeIdList.forEach((leaverId) => {
      roomLeaveAddDebounce(roomId, leaverId);
    });
  }
  return ret;
};
