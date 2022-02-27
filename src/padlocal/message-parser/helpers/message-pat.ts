import type { Message } from "padlocal-client-ts/dist/proto/padlocal_pb";
import { xmlToJson } from "../../utils/xml-to-json";

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
  chatroom: string;
  fromusername: string;
  chatusername: string;
  pattedusername: string;
  template: string;
}

export async function isPatMessage(message: Message.AsObject) {
  const content = message.content.trim();
  const parts = content.split(":");
  if (parts.length < 1) {
    return false;
  }

  const xml = parts[1];
  if (!xml) {
    return false;
  }

  const patXml: PatXmlSchema = await xmlToJson(xml);
  return patXml.sysmsg.$.type === "pat";
}

export async function patMessageParser(message: Message.AsObject): Promise<PatMessagePayload> {
  const content = message.content.trim();
  const parts = content.split(":");
  const chatroom = parts[0]!;
  const xml = parts[1]!;

  const patXml: PatXmlSchema = await xmlToJson(xml);

  return {
    chatroom,
    chatusername: patXml.sysmsg.pat.chatusername,
    fromusername: patXml.sysmsg.pat.fromusername,
    pattedusername: patXml.sysmsg.pat.pattedusername,
    template: patXml.sysmsg.pat.template,
  };
}
