import { Message } from "padlocal-client-ts/dist/proto/padlocal_pb";
import {
  EventRoomJoinPayload,
  EventRoomLeavePayload,
  EventRoomTopicPayload,
  FriendshipPayload,
  RoomInvitationPayload,
} from "wechaty-puppet";

export enum MessageCategory {
  NormalMessage, // none-trivial conversation messages, e.g. text, image, voice, video.
  Friendship, // messages related to friendship, e.g. added user.
  RoomInvite, // messages related to room join
  RoomJoin,
  RoomLeave,
  RoomTopic,
}

export interface ParsedMessagePayloadSpec {
  [MessageCategory.NormalMessage]: Message.AsObject;
  [MessageCategory.Friendship]: FriendshipPayload;
  [MessageCategory.RoomInvite]: RoomInvitationPayload;
  [MessageCategory.RoomJoin]: EventRoomJoinPayload;
  [MessageCategory.RoomLeave]: EventRoomLeavePayload;
  [MessageCategory.RoomTopic]: EventRoomTopicPayload;
}

export interface ParsedMessage<T extends keyof ParsedMessagePayloadSpec> {
  category: T;
  payload: ParsedMessagePayloadSpec[T];
}
