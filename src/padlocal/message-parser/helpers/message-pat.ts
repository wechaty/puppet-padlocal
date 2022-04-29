import type { Message } from "padlocal-client-ts/dist/proto/padlocal_pb";
import { xmlToJson } from "../../utils/xml-to-json";
import { WechatMessageType } from "../WechatMessageType";

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

export async function parseMessagePatPayload(message: Message.AsObject): Promise<PatMessagePayload | null> {
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
  if (patXml.sysmsg.$.type !== "pat" || !patXml.sysmsg.pat) {
    return null;
  }

  return {
    fromusername: patXml.sysmsg.pat.fromusername,
    chatusername: patXml.sysmsg.pat.chatusername,
    pattedusername: patXml.sysmsg.pat.pattedusername,
    template: patXml.sysmsg.pat.template,
  };
}
