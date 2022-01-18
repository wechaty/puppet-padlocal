/**
 * Various business logics are carried by Message, resolve detailed logic from Message here.
 */

import friendShipParser from "./message-parser-friendship.js";
import roomInviteParser from "./message-parser-room-invite.js";
import roomJoinParser from "./message-parser-room-join.js";
import roomLeaveParser from "./message-parser-room-leave.js";
import roomTopicParser from "./message-parser-room-topic.js";

import { registerMessageParser } from "./message-parser.js";
import { MessageCategory } from "./message-parser-type.js";

registerMessageParser(MessageCategory.Friendship, friendShipParser);
registerMessageParser(MessageCategory.RoomInvite, roomInviteParser);
registerMessageParser(MessageCategory.RoomJoin, roomJoinParser);
registerMessageParser(MessageCategory.RoomLeave, roomLeaveParser);
registerMessageParser(MessageCategory.RoomTopic, roomTopicParser);

export { parseMessage } from "./message-parser.js";
