import { parseTextWithRegexList } from "../../utils/regex.js";
import { executeRunners } from "../../utils/runner.js";
import type * as PUPPET from "wechaty-puppet";
import { isIMRoomId, isRoomId } from "../../utils/is-type.js";

export interface RevokeMsgXmlSchema {
  session: string;
  msgid: string;
  newmsgid: string;
  replacemsg: string;
}

export type RevokeMsgType = "You" | "Other";

export interface RevokeMsgMessagePayload {
  content: string;
  operatorNickName?: string,
  originalMessageId: string;
  session: string;
  type: RevokeMsgType;
}

const YOU_REVOKE_REGEX_LIST = [
  /你撤回了一条消息/,
  /You recalled a message/,
];
const OTHER_REVOKE_REGEX_LIST = [
  /"(.+)" 撤回了一条消息/,
  /"(.+)" has recalled a message./,
];

export async function parseRevokeMsgMessagePayload(revokeMsgXmlSchema: RevokeMsgXmlSchema): Promise<RevokeMsgMessagePayload> {
  let nickName: string | undefined;

  const youRevoke = async() => parseTextWithRegexList<RevokeMsgType>(revokeMsgXmlSchema.replacemsg, YOU_REVOKE_REGEX_LIST, async() => "You");
  const otherRevoke = async() => parseTextWithRegexList<RevokeMsgType>(revokeMsgXmlSchema.replacemsg, OTHER_REVOKE_REGEX_LIST, async(_, match) => {
    nickName = match[1];
    return "Other";
  });

  const type = (await executeRunners<RevokeMsgType>([youRevoke, otherRevoke]))!;

  return {
    content: revokeMsgXmlSchema.replacemsg,
    operatorNickName: nickName,
    originalMessageId: revokeMsgXmlSchema.newmsgid,
    session: revokeMsgXmlSchema.session,
    type,
  };
}

export async function getRevokeOriginalMessage(puppet: PUPPET.Puppet, revokemsgPayload:RevokeMsgMessagePayload): Promise<PUPPET.payloads.Message | null> {
  const messageIdList = await puppet.messageSearch({ id: revokemsgPayload.originalMessageId });
  if (messageIdList.length) {
    return puppet.messagePayload(messageIdList[0]!);
  }

  return null;
}

export async function getRevokeOperatorIdForRoomMessage(puppet: PUPPET.Puppet, revokemsgPayload:RevokeMsgMessagePayload) : Promise<string | null> {
  if (isRoomId(revokemsgPayload.session) || isIMRoomId(revokemsgPayload.session)) {
    const contactIdList = await puppet.roomMemberSearch(revokemsgPayload.session, revokemsgPayload.operatorNickName!);
    if (contactIdList.length) {
      return contactIdList[0]!;
    }
  }

  return null;
}
