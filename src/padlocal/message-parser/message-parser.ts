import type PadLocal  from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import { MessageCategory, ParsedMessage, ParsedMessagePayloadSpec } from "./message-parser-type.js";
import { Puppet, log } from "wechaty-puppet";

const PRE = "[MessageParser]";

export type MessageParserRetType = ParsedMessagePayloadSpec[keyof ParsedMessagePayloadSpec] | null;
export type MessageParser = (puppet: Puppet, message: PadLocal.Message.AsObject) => Promise<MessageParserRetType>;

const MessageParsers: Map<MessageCategory, MessageParser> = new Map();
export function registerMessageParser(category: MessageCategory, parser: MessageParser): void {
  MessageParsers.set(category, parser);
}

export async function parseMessage(puppet: Puppet, message: PadLocal.Message.AsObject): Promise<ParsedMessage<any>> {
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
      log.error(PRE, `parse message error: ${(e as Error).stack}`);
    }
  }

  // if none special category parsed, return normal as message
  return {
    category: MessageCategory.NormalMessage,
    payload: message,
  };
}
