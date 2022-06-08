import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import * as PUPPET from "wechaty-puppet";
import { executeMessageParsers } from "./message/mod.js";

export async function padLocalMessageToWechaty(puppet: PUPPET.Puppet, padLocalMessage: PadLocal.Message.AsObject): Promise<PUPPET.payloads.Message> {
  // set default value for MessagePayloadBase, other fields will be fulfilled or updated var MessageParers
  const ret: PUPPET.payloads.Message = {
    id: padLocalMessage.id,
    talkerId: padLocalMessage.fromusername,
    text: padLocalMessage.content,
    timestamp: padLocalMessage.createtime,
    type: PUPPET.types.Message.Unknown,
  } as PUPPET.payloads.Message;

  await executeMessageParsers(puppet, padLocalMessage, ret);

  // validate the return value
  if (!(ret.roomId || ret.listenerId)) {
    throw new Error("neither roomId nor listenerId");
  }

  return ret;
}
