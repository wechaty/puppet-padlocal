import friendShipParser from "./event-friendship.js";
import roomInviteParser from "./event-room-invite.js";
import roomJoinParser from "./event-room-join.js";
import roomLeaveParser from "./event-room-leave.js";
import roomTopicParser from "./event-room-topic.js";
import messageParser from "./event-message.js";
import { addEventParser, EventType, parseEvent } from "./event.js";

addEventParser(EventType.Friendship, friendShipParser);
addEventParser(EventType.RoomInvite, roomInviteParser);
addEventParser(EventType.RoomJoin, roomJoinParser);
addEventParser(EventType.RoomLeave, roomLeaveParser);
addEventParser(EventType.RoomTopic, roomTopicParser);
addEventParser(EventType.Message, messageParser);

export { parseEvent, EventType };
