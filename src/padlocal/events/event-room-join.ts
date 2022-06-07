import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import type * as PUPPET from "wechaty-puppet";
import { isRoomId } from "../utils/is-type.js";
import type { EventPayload } from "./event.js";
import { removeRoomLeaveDebounce } from "./event-room-leave.js";
import { parseSysmsgSysmsgTemplateMessagePayload } from "../messages/message-sysmsg.js";
import {
  createSysmsgTemplateRunner,
  SysmsgTemplateLinkProfile,
} from "../messages/sysmsg/message-sysmsgtemplate.js";
import { executeRunners } from "../utils/runner.js";

const YOU_INVITE_OTHER_REGEX_LIST = [
  /^你邀请"(.+)"加入了群聊 {2}\$revoke\$/,
  /^You invited (.+) to the group chat/,
];
const OTHER_INVITE_YOU_REGEX_LIST = [
  /^"([^"]+?)"邀请你加入了群聊，群聊参与人还有：(.+)/,
  /^(.+) invited you to a group chat with (.+)/,
];
const OTHER_INVITE_YOU_AND_OTHER_REGEX_LIST = [
  /^"([^"]+?)"邀请你和"(.+?)"加入了群聊/,
  /^(.+?) invited you and (.+?) to (the|a) group chat/,
];
const OTHER_INVITE_OTHER_REGEX_LIST = [
  /^"(.+)"邀请"(.+)"加入了群聊/,
  /^(.+?) invited (.+?) to (the|a) group chat/,
];
const OTHER_JOIN_VIA_YOUR_QRCODE_REGEX_LIST = [
  /^" ?(.+)"通过扫描你分享的二维码加入群聊/,
  /^" ?(.+)" joined group chat via the QR code you shared/,
];
const OTHER_JOIN_VIA_OTHER_QRCODE_REGEX_LIST = [
  /^" (.+)"通过扫描"(.+)"分享的二维码加入群聊/,
  /^"(.+)" joined the group chat via the QR Code shared by "(.+)"/,
];

export default async(puppet: PUPPET.Puppet, message: PadLocal.Message.AsObject): Promise<EventPayload> => {
  const roomId = message.fromusername;
  if (!isRoomId(roomId)) {
    return null;
  }

  const timestamp = message.createtime;

  const sysmsgTemplatePayload = await parseSysmsgSysmsgTemplateMessagePayload(message);
  if (!sysmsgTemplatePayload) {
    return null;
  }

  /**
   * 1. You Invite Other to join the Room
   * (including other join var qr code you shared)
   * /^你邀请"(.+)"加入了群聊 {2}\$revoke\$/,
   * /^" ?(.+)"通过扫描你分享的二维码加入群聊/,
   */
  const youInviteOther = createSysmsgTemplateRunner<PUPPET.payloads.EventRoomJoin>(
    sysmsgTemplatePayload,
    [...YOU_INVITE_OTHER_REGEX_LIST, ...OTHER_JOIN_VIA_YOUR_QRCODE_REGEX_LIST],
    async(templateLinkList) => {
      // the first item MUST be others profile link
      const inviteeList = templateLinkList[0]!.payload as SysmsgTemplateLinkProfile;
      // filter other empty userName, in case the user is not your friend
      const inviteeIdList = inviteeList.map(m => m.userName).filter(s => !!s);
      return {
        inviteeIdList,
        inviterId: puppet.currentUserId,
        roomId,
        timestamp,
      } as PUPPET.payloads.EventRoomJoin;
    });

  /**
   * 2. Other Invite you to join the Room
   * /^"([^"]+?)"邀请你加入了群聊/,
   */
  const otherInviteYou = createSysmsgTemplateRunner<PUPPET.payloads.EventRoomJoin>(
    sysmsgTemplatePayload,
    OTHER_INVITE_YOU_REGEX_LIST,
    async(templateLinkList) => {
      // the first must invitor
      const inviter = templateLinkList[0]!.payload as SysmsgTemplateLinkProfile;

      return {
        inviteeIdList: [puppet.currentUserId],
        inviterId: inviter[0]!.userName,
        roomId,
        timestamp,
      } as PUPPET.payloads.EventRoomJoin;
    });

  /**
   * 3. Other invite you and others to join the room
   * /^"([^"]+?)"邀请你和"(.+?)"加入了群聊/,
   * /^"(.+)"邀请"(.+)"加入了群聊/,
   */
  const otherInviteOther = createSysmsgTemplateRunner<PUPPET.payloads.EventRoomJoin>(
    sysmsgTemplatePayload,
    [...OTHER_INVITE_YOU_AND_OTHER_REGEX_LIST, ...OTHER_INVITE_OTHER_REGEX_LIST],
    async(templateLinkList, matchedRegexIndex) => {
      // the first item is invitor
      const inviter = templateLinkList[0]!.payload as SysmsgTemplateLinkProfile;

      // the second item is others
      const inviteeList = templateLinkList[1]!.payload as SysmsgTemplateLinkProfile;
      // filter other empty userName, in case the user is not your friend
      const inviteeIdList = inviteeList.map(m => m.userName).filter(s => !!s);

      const includingYou = matchedRegexIndex < OTHER_INVITE_YOU_AND_OTHER_REGEX_LIST.length;
      if (includingYou) {
        inviteeIdList.unshift(puppet.currentUserId);
      }

      return {
        inviteeIdList,
        inviterId: inviter[0]!.userName,
        roomId,
        timestamp,
      } as PUPPET.payloads.EventRoomJoin;
    });

  /**
   * 4. Other Invite Other via Qrcode to join a Room
   * /^" (.+)"通过扫描"(.+)"分享的二维码加入群聊/,
   */
  const otherJoinViaQrCode = createSysmsgTemplateRunner<PUPPET.payloads.EventRoomJoin>(
    sysmsgTemplatePayload,
    OTHER_JOIN_VIA_OTHER_QRCODE_REGEX_LIST,
    async(templateLinkList) => {
      // the first item is invitee
      const inviteeList = templateLinkList[0]!.payload as SysmsgTemplateLinkProfile;
      // filter other empty userName, in case the user is not your friend
      const inviteeIdList = inviteeList.map(m => m.userName).filter(s => !!s);

      // the second item is inviter
      const inviter = templateLinkList[1]!.payload as SysmsgTemplateLinkProfile;

      return {
        inviteeIdList,
        inviterId: inviter[0]!.userName,
        roomId,
        timestamp,
      } as PUPPET.payloads.EventRoomJoin;
    });

  const ret = await executeRunners([youInviteOther, otherInviteYou, otherInviteOther, otherJoinViaQrCode]);
  if (ret) {
    ret.inviteeIdList.forEach((inviteeId) => {
      removeRoomLeaveDebounce(ret!.roomId, inviteeId);
    });
  }
  return ret;
};
