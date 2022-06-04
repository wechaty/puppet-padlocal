/**
 * Various business logics are carried by Message, resolve detailed logic from Message here.
 */

import friendShipParser from "./message-category-friendship.js";
import roomInviteParser from "./message-category-room-invite.js";
import roomJoinParser from "./message-category-room-join.js";
import roomLeaveParser from "./message-category-room-leave.js";
import roomTopicParser from "./message-category-room-topic.js";
import { MessageCategory, registerMessageParser } from "./message-category.js";

registerMessageParser(MessageCategory.Friendship, friendShipParser);
registerMessageParser(MessageCategory.RoomInvite, roomInviteParser);
registerMessageParser(MessageCategory.RoomJoin, roomJoinParser);
registerMessageParser(MessageCategory.RoomLeave, roomLeaveParser);
registerMessageParser(MessageCategory.RoomTopic, roomTopicParser);

export { parseMessageCategory } from "./message-category.js";
