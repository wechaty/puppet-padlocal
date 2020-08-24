import { Message } from "padlocal-client-ts/dist/proto/padlocal_pb";
import { EventRoomLeavePayload, Puppet, YOU } from "wechaty-puppet";
import { RoomXmlSchema } from "./helpers/message-room";
import { isRoomId } from "../utils/is-type";
import { getUserName } from "../utils/get-xml-label";
import { xmlToJson } from "../utils/xml-to-json";
import { MessageParserRetType } from "./message-parser";

const ROOM_LEAVE_OTHER_REGEX_LIST = [/^(You) removed "(.+)" from the group chat/, /^(你)将"(.+)"移出了群聊/];
const ROOM_LEAVE_BOT_REGEX_LIST = [/^(You) were removed from the group chat by "([^"]+)"/, /^(你)被"([^"]+?)"移出群聊/];

export default async (puppet: Puppet, message: Message.AsObject): Promise<MessageParserRetType> => {
  const roomId = message.fromusername;
  if (!isRoomId(roomId)) {
    return null;
  }

  let content = message.content;
  let linkList;

  const needParseXML = content.includes("移出群聊") || content.includes("You were removed from the group chat by");
  if (!needParseXML) {
    const tryXmlText = content.replace(/^[^\n]+\n/, "");
    const roomXml: RoomXmlSchema = await xmlToJson(tryXmlText); // toJson(tryXmlText, { object: true }) as RoomRelatedXmlSchema
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
    removerId = (await puppet.roomMemberSearch(roomId, YOU))[0];
    const leaverName = matchesForOther[2];
    leaverId = getUserName([linkList], leaverName);
  } else if (matchesForBot) {
    removerId = matchesForBot[2];
    leaverId = (await puppet.roomMemberSearch(roomId, YOU))[0];
  } else {
    throw new Error("for typescript type checking, will never go here");
  }

  return {
    removeeIdList: [leaverId],
    removerId,
    roomId,
    timestamp: message.createtime,
  } as EventRoomLeavePayload;
};
