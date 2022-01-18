import type { Message } from "padlocal-client-ts/dist/proto/padlocal_pb";
import type * as PUPPET from "wechaty-puppet";

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
  [MessageCategory.Friendship]: PUPPET.payloads.Friendship;
  [MessageCategory.RoomInvite]: PUPPET.payloads.RoomInvitation;
  [MessageCategory.RoomJoin]: PUPPET.payloads.EventRoomJoin;
  [MessageCategory.RoomLeave]: PUPPET.payloads.EventRoomLeave;
  [MessageCategory.RoomTopic]: PUPPET.payloads.EventRoomTopic;
}

export interface ParsedMessage<T extends keyof ParsedMessagePayloadSpec> {
  category: T;
  payload: ParsedMessagePayloadSpec[T];
}
