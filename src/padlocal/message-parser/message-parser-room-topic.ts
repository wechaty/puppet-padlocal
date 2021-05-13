import { Message } from "padlocal-client-ts/dist/proto/padlocal_pb";
import { EventRoomTopicPayload, Puppet, YOU } from "wechaty-puppet";
import { RoomXmlSchema } from "./helpers/message-room";
import { isRoomId } from "../utils/is-type";
import { xmlToJson } from "../utils/xml-to-json";
import { getNickName, getUserName } from "../utils/get-xml-label";
import { MessageParserRetType } from "./message-parser";

const ROOM_TOPIC_OTHER_REGEX_LIST = [/^"(.+)" changed the group name to "(.+)"$/, /^"(.+)"修改群名为“(.+)”$/];
const ROOM_TOPIC_YOU_REGEX_LIST = [/^(You) changed the group name to "(.+)"$/, /^(你)修改群名为“(.+)”$/];

export default async (puppet: Puppet, message: Message.AsObject): Promise<MessageParserRetType> => {
  const roomId = message.fromusername;
  if (!isRoomId(roomId)) {
    return null;
  }

  let content = message.content;
  const needParseXML = content.includes("你修改群名为") || content.includes("You changed the group name to");
  let linkList;

  if (!needParseXML) {
    const roomXml: RoomXmlSchema = await xmlToJson(content);
    if (!roomXml || !roomXml.sysmsg || !roomXml.sysmsg.sysmsgtemplate) {
      return null;
    }

    content = roomXml.sysmsg.sysmsgtemplate.content_template.template;
    linkList = roomXml.sysmsg.sysmsgtemplate.content_template.link_list.link;
  }

  let matchesForOther: null | string[] = [];
  let matchesForYou: null | string[] = [];

  ROOM_TOPIC_OTHER_REGEX_LIST.some((regex) => !!(matchesForOther = content.match(regex)));
  ROOM_TOPIC_YOU_REGEX_LIST.some((regex) => !!(matchesForYou = content.match(regex)));

  const matches: string[] = matchesForOther || matchesForYou;
  if (!matches) {
    return null;
  }

  let changerId = matches[1];
  let topic = matches[2];

  if ((matchesForYou && changerId === "你") || changerId === "You") {
    changerId = (await puppet.roomMemberSearch(roomId, YOU))[0];
  } else {
    changerId = getUserName(linkList, changerId);
    topic = getNickName(linkList, topic);
  }

  const room = await puppet.roomPayload(roomId);
  const oldTopic = room.topic;

  return {
    changerId,
    roomId,
    timestamp: message.createtime,
    oldTopic,
    newTopic: topic,
  } as EventRoomTopicPayload;
};
