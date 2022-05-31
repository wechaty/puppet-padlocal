import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import { WechatMessageType } from "../WechatMessageType.js";
import { xmlToJson } from "../../utils/xml-to-json.js";
import type { PatMessagePayload, PatXmlSchema } from "./sysmsg/message-pat";
import type { SysmsgTemplateMessagePayload, SysmsgTemplateXmlSchema } from "./sysmsg/message-sysmsgtemplate";
import { parsePatMessagePayload } from "./sysmsg/message-pat.js";
import { parseSysmsgTemplateMessagePayload } from "./sysmsg/message-sysmsgtemplate.js";

interface SysmsgXmlSchema {
  sysmsg: {
    $: {
      type: string;
    },
    pat?: PatXmlSchema,
    sysmsgtemplate?: SysmsgTemplateXmlSchema
  };
}

type SysMsgType = "pat" | "sysmsgtemplate";
type SysMsgPayload = PatMessagePayload | SysmsgTemplateMessagePayload;

export interface SysmsgMessagePayload {
  type: SysMsgType;
  payload: SysMsgPayload
}

export async function parseSysmsgMessage(message: PadLocal.Message.AsObject): Promise<SysmsgMessagePayload | null> {
  if (message.type !== WechatMessageType.Recalled) {
    return null;
  }

  const content = message.content.trim();
  const sysmsgIndex = content.indexOf("<sysmsg");
  if (sysmsgIndex === -1) {
    return null;
  }

  const sysmsgXml: SysmsgXmlSchema = await xmlToJson(content.substring(sysmsgIndex));

  let payload : SysMsgPayload | undefined;
  switch (sysmsgXml.sysmsg.$.type) {
    case "pat":
      payload = await parsePatMessagePayload(sysmsgXml.sysmsg.pat!);
      break;
    case "sysmsgtemplate":
      payload = await parseSysmsgTemplateMessagePayload(sysmsgXml.sysmsg.sysmsgtemplate!);
      break;
  }

  if (payload) {
    return {
      payload,
      type: sysmsgXml.sysmsg.$.type as SysMsgType,
    };
  } else {
    return null;
  }
}
