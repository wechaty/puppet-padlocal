import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import { xmlToJson } from "../../utils/xml-to-json.js";
import { WechatMessageType } from "../WechatMessageType.js";

interface PatXmlSchema {
  sysmsg: {
    $: {
      type: string;
    };
    pat: {
      fromusername: string;
      chatusername: string;
      pattedusername: string;
      template: string;
    };
  };
}

export interface PatMessagePayload {
  fromusername: string;
  chatusername: string;
  pattedusername: string;
  template: string;
}

export async function parseMessagePatPayload(message: PadLocal.Message.AsObject): Promise<PatMessagePayload | null> {
  if (message.type !== WechatMessageType.Recalled) {
    return null;
  }

  const content = message.content.trim();
  const sysmsgIndex = content.indexOf("<sysmsg");
  if (sysmsgIndex === -1) {
    return null;
  }

  const sysmsgXML = content.substring(sysmsgIndex);
  const patXml: PatXmlSchema = await xmlToJson(sysmsgXML);
  if (patXml.sysmsg.$.type !== "pat") {
    return null;
  }

  return {
    chatusername: patXml.sysmsg.pat.chatusername,
    fromusername: patXml.sysmsg.pat.fromusername,
    pattedusername: patXml.sysmsg.pat.pattedusername,
    template: patXml.sysmsg.pat.template,
  };
}
