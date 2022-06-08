import type * as PUPPET from "wechaty-puppet";
import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import type { AppMessagePayload } from "../../messages/message-appmsg";

/**
 * Add customized message parser context info here
 */
export type MessageParserContext = {
  puppet: PUPPET.Puppet,
  isRoomMessage: boolean,
  appMessagePayload?: AppMessagePayload,
};

export type MessageParser = (padLocalMessage: PadLocal.Message.AsObject, ret: PUPPET.payloads.Message, context: MessageParserContext) => Promise<PUPPET.payloads.Message>;

const messageParserList: Array<MessageParser> = [];

export function addMessageParser(parser: MessageParser) {
  messageParserList.push(parser);
}

export async function executeMessageParsers(puppet: PUPPET.Puppet, padLocalMessage: PadLocal.Message.AsObject, ret: PUPPET.payloads.Message): Promise<PUPPET.payloads.Message> {
  const context: MessageParserContext = {
    isRoomMessage: false,
    puppet,
  };

  for (const parser of messageParserList) {
    ret = await parser(padLocalMessage, ret, context);
  }

  return ret;
}

export const LOGPRE = "message-parser";
