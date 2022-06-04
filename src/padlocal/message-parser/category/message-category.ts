import type PadLocal  from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import { Puppet, log } from "wechaty-puppet";
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

export interface MessageCategoryPayloadSpec {
  [MessageCategory.NormalMessage]: Message.AsObject;
  [MessageCategory.Friendship]: PUPPET.payloads.Friendship;
  [MessageCategory.RoomInvite]: PUPPET.payloads.RoomInvitation;
  [MessageCategory.RoomJoin]: PUPPET.payloads.EventRoomJoin;
  [MessageCategory.RoomLeave]: PUPPET.payloads.EventRoomLeave;
  [MessageCategory.RoomTopic]: PUPPET.payloads.EventRoomTopic;
}

export type MessageCategoryParserRet = MessageCategoryPayloadSpec[keyof MessageCategoryPayloadSpec] | null;
export type MessageCategoryParser = (puppet: Puppet, message: PadLocal.Message.AsObject) => Promise<MessageCategoryParserRet>;

const MessageParsers: Map<MessageCategory, MessageCategoryParser> = new Map();
export function registerMessageParser(category: MessageCategory, parser: MessageCategoryParser): void {
  MessageParsers.set(category, parser);
}

export interface ParsedMessageCategory<T extends keyof MessageCategoryPayloadSpec> {
  category: T;
  payload: MessageCategoryPayloadSpec[T];
}

export async function parseMessageCategory(puppet: Puppet, message: PadLocal.Message.AsObject): Promise<ParsedMessageCategory<any>> {
  for (const [category, parser] of MessageParsers.entries()) {
    try {
      const parsedPayload = await parser(puppet, message);
      if (parsedPayload) {
        return {
          category,
          payload: parsedPayload,
        };
      }
    } catch (e) {
      log.error("[MessageCategory]", `parse message error: ${(e as Error).stack}`);
    }
  }

  // if none special category parsed, return normal as message
  return {
    category: MessageCategory.NormalMessage,
    payload: message,
  };
}
