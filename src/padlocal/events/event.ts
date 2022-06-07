import type PadLocal  from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import { Puppet, log } from "wechaty-puppet";
import type { Message } from "padlocal-client-ts/dist/proto/padlocal_pb";
import type * as PUPPET from "wechaty-puppet";

export enum EventType {
  Message,
  Friendship,
  RoomInvite,
  RoomJoin,
  RoomLeave,
  RoomTopic,
}

export interface EventPayloadSpec {
  [EventType.Message]: Message.AsObject;
  [EventType.Friendship]: PUPPET.payloads.Friendship;
  [EventType.RoomInvite]: PUPPET.payloads.RoomInvitation;
  [EventType.RoomJoin]: PUPPET.payloads.EventRoomJoin;
  [EventType.RoomLeave]: PUPPET.payloads.EventRoomLeave;
  [EventType.RoomTopic]: PUPPET.payloads.EventRoomTopic;
}

export interface Event<T extends keyof EventPayloadSpec> {
  type: T;
  payload: EventPayloadSpec[T];
}

export type EventPayload = EventPayloadSpec[keyof EventPayloadSpec] | null;
export type EventParserHandler = (puppet: Puppet, message: PadLocal.Message.AsObject) => Promise<EventPayload>;
type EventParser = { type: EventType, handler: EventParserHandler, };

const EventParserList: Array<EventParser> = [];
export function addEventParser(eventType: EventType, parser: EventParserHandler): void {
  EventParserList.push({
    handler: parser,
    type: eventType,
  });
}

export async function parseEvent(puppet: Puppet, message: PadLocal.Message.AsObject): Promise<Event<any>> {
  for (const parser of EventParserList) {
    try {
      const parsedPayload = await parser.handler(puppet, message);
      if (parsedPayload) {
        return {
          payload: parsedPayload,
          type: parser.type,
        };
      }
    } catch (e) {
      log.error("[Event]", `parse message error: ${(e as Error).stack}`);
    }
  }

  // return normal as message bvy default
  return {
    payload: message,
    type: EventType.Message,
  };
}
