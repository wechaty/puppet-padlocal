/**
 * Various business logics are carried by Message, resolve detailed logic from Message here.
 */

import friendShipParser from "./message-parser-friendship";
import roomInviteParser from "./message-parser-room-invite";
import roomJoinParser from "./message-parser-room-join";
import roomLeaveParser from "./message-parser-room-leave";
import roomTopicParser from "./message-parser-room-topic";

import { registerMessageParser } from "./message-parser";
import { MessageCategory } from "./message-parser-type";

registerMessageParser(MessageCategory.Friendship, friendShipParser);
registerMessageParser(MessageCategory.RoomInvite, roomInviteParser);
registerMessageParser(MessageCategory.RoomJoin, roomJoinParser);
registerMessageParser(MessageCategory.RoomLeave, roomLeaveParser);
registerMessageParser(MessageCategory.RoomTopic, roomTopicParser);

export { parseMessage } from "./message-parser";
