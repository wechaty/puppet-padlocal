import { Message } from "padlocal-client-ts/dist/proto/padlocal_pb";
import { EventRoomJoinPayload, Puppet, YOU } from "wechaty-puppet";
import { RoomXmlSchema } from "./helpers/message-room";
import { isRoomId } from "../utils/is-type";
import { xmlToJson } from "../utils/xml-to-json";
import { getUserName } from "../utils/get-xml-label";
import { MessageParserRetType } from "./message-parser";

const ROOM_JOIN_BOT_INVITE_OTHER_REGEX_LIST_ZH = [
  /^你邀请"(.+)"加入了群聊 {2}\$revoke\$/,
  /^" ?(.+)"通过扫描你分享的二维码加入群聊/,
];

const ROOM_JOIN_OTHER_INVITE_BOT_REGEX_LIST_ZH = [
  /^"([^"]+?)"邀请你加入了群聊，群聊参与人还有：(.+)/,
  /^"([^"]+?)"邀请你和"(.+?)"加入了群聊/,
];
const ROOM_JOIN_OTHER_INVITE_OTHER_REGEX_LIST_ZH = [/^"(.+)"邀请"(.+)"加入了群聊/];
const ROOM_JOIN_OTHER_INVITE_OTHER_QRCODE_REGEX_LIST_ZH = [/^" (.+)"通过扫描"(.+)"分享的二维码加入群聊/];

const ROOM_JOIN_BOT_INVITE_OTHER_REGEX_LIST_EN = [
  /^You invited (.+) to the group chat/,
  /^" ?(.+)" joined group chat via the QR code you shared/,
];
const ROOM_JOIN_OTHER_INVITE_BOT_REGEX_LIST_EN = [/^(.+) invited you to a group chat with (.+)/];
const ROOM_JOIN_OTHER_INVITE_OTHER_REGEX_LIST_EN = [/^(.+?) invited (.+?) to (the|a) group chat/];
const ROOM_JOIN_OTHER_INVITE_OTHER_QRCODE_REGEX_LIST_EN = [
  /^"(.+)" joined the group chat via the QR Code shared by "(.+)"/,
];

export default async (puppet: Puppet, message: Message.AsObject): Promise<MessageParserRetType> => {
  const roomId = message.fromusername;
  if (!isRoomId(roomId)) {
    return null;
  }

  const timestamp = message.createtime;

  let content = message.content;
  let linkList;
  const jsonPayload: RoomXmlSchema = await xmlToJson(content);
  if (!jsonPayload || !jsonPayload.sysmsg || !jsonPayload.sysmsg.sysmsgtemplate) {
    return null;
  }

  content = jsonPayload.sysmsg.sysmsgtemplate.content_template.template;
  linkList = jsonPayload.sysmsg.sysmsgtemplate.content_template.link_list.link;

  /**
   * Process English language
   */
  let matchesForBotInviteOtherEn = null as null | string[];
  let matchesForOtherInviteBotEn = null as null | string[];
  let matchesForOtherInviteOtherEn = null as null | string[];
  let matchesForOtherInviteOtherQrcodeEn = null as null | string[];

  ROOM_JOIN_BOT_INVITE_OTHER_REGEX_LIST_EN.some((regex) => !!(matchesForBotInviteOtherEn = content.match(regex)));
  ROOM_JOIN_OTHER_INVITE_BOT_REGEX_LIST_EN.some((regex) => !!(matchesForOtherInviteBotEn = content.match(regex)));
  ROOM_JOIN_OTHER_INVITE_OTHER_REGEX_LIST_EN.some((regex) => !!(matchesForOtherInviteOtherEn = content.match(regex)));
  ROOM_JOIN_OTHER_INVITE_OTHER_QRCODE_REGEX_LIST_EN.some(
    (regex) => !!(matchesForOtherInviteOtherQrcodeEn = content.match(regex))
  );

  /**
   * Process Chinese language
   */
  let matchesForBotInviteOtherZh = null as null | string[];
  let matchesForOtherInviteBotZh = null as null | string[];
  let matchesForOtherInviteOtherZh = null as null | string[];
  let matchesForOtherInviteOtherQrcodeZh = null as null | string[];

  ROOM_JOIN_BOT_INVITE_OTHER_REGEX_LIST_ZH.some((regex) => !!(matchesForBotInviteOtherZh = content.match(regex)));
  ROOM_JOIN_OTHER_INVITE_BOT_REGEX_LIST_ZH.some((regex) => !!(matchesForOtherInviteBotZh = content.match(regex)));
  ROOM_JOIN_OTHER_INVITE_OTHER_REGEX_LIST_ZH.some((regex) => !!(matchesForOtherInviteOtherZh = content.match(regex)));
  ROOM_JOIN_OTHER_INVITE_OTHER_QRCODE_REGEX_LIST_ZH.some(
    (regex) => !!(matchesForOtherInviteOtherQrcodeZh = content.match(regex))
  );

  const matchesForBotInviteOther = matchesForBotInviteOtherEn || matchesForBotInviteOtherZh;
  const matchesForOtherInviteBot = matchesForOtherInviteBotEn || matchesForOtherInviteBotZh;
  const matchesForOtherInviteOther = matchesForOtherInviteOtherEn || matchesForOtherInviteOtherZh;
  const matchesForOtherInviteOtherQrcode = matchesForOtherInviteOtherQrcodeEn || matchesForOtherInviteOtherQrcodeZh;

  const matches =
    matchesForBotInviteOther ||
    matchesForOtherInviteBot ||
    matchesForOtherInviteOther ||
    matchesForOtherInviteOtherQrcode;

  if (!matches) {
    return null;
  }

  const checkString = (inviteeIdList: string | string[]) => {
    return typeof inviteeIdList !== "string" ? inviteeIdList : [inviteeIdList];
  };

  /**
   * Parse all Names From the Event Text
   */
  if (matchesForBotInviteOther) {
    /**
     * 1. Bot Invite Other to join the Room
     *  (include invite via QrCode)
     */
    const other = matches[1];
    const inviteeIdList = getUserName(linkList, other);

    return {
      inviteeIdList: checkString(inviteeIdList),
      inviterId: (await puppet.roomMemberSearch(roomId, YOU))[0],
      roomId,
      timestamp,
    } as EventRoomJoinPayload;
  } else if (matchesForOtherInviteBot) {
    /**
     * 2. Other Invite Bot to join the Room
     */
    // /^"([^"]+?)"邀请你加入了群聊/,
    // /^"([^"]+?)"邀请你和"(.+?)"加入了群聊/,
    const _inviterName = matches[1];
    const inviterId = getUserName(linkList, _inviterName);

    return {
      inviteeIdList: await puppet.roomMemberSearch(roomId, YOU),
      inviterId,
      roomId,
      timestamp,
    } as EventRoomJoinPayload;
  } else if (matchesForOtherInviteOther) {
    /**
     * 3. Other Invite Other to a Room
     *  (NOT include invite via Qrcode)
     */
    // /^"([^"]+?)"邀请"([^"]+)"加入了群聊$/,
    // /^([^"]+?) invited ([^"]+?) to (the|a) group chat/,
    const _inviterName = matches[1];
    const inviterId = getUserName(linkList, _inviterName);

    const _others = matches[2];
    const inviteeIdList = getUserName(linkList, _others);

    return {
      inviteeIdList: checkString(inviteeIdList),
      inviterId,
      roomId,
      timestamp,
    } as EventRoomJoinPayload;
  } else if (matchesForOtherInviteOtherQrcode) {
    /**
     * 4. Other Invite Other via Qrcode to join a Room
     *   /^" (.+)"通过扫描"(.+)"分享的二维码加入群聊/,
     */
    const _inviterName = matches[2];
    const inviterId = getUserName(linkList, _inviterName);

    const other = matches[1];
    const inviteeIdList = getUserName(linkList, other);

    return {
      inviteeIdList: checkString(inviteeIdList),
      inviterId,
      roomId,
      timestamp,
    } as EventRoomJoinPayload;
  }

  return null;
};
