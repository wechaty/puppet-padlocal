import { Message } from "padlocal-client-ts/dist/proto/padlocal_pb";
import { xmlToJson } from "../../utils/xml-to-json";

interface EmotionXmlSchema {
  msg: {
    emoji: {
      $: {
        type: string;
        len: string;
        cdnurl: string;
        width: string;
        height: string;
      };
    };
  };
}

export interface EmojiMessagePayload {
  cdnurl: string;
  len: number;
  width: number;
  height: number;
}

export async function emotionPayloadParser(message: Message.AsObject): Promise<EmojiMessagePayload> {
  const tryXmlText = message.content.replace(/^[^\n]+\n/, "");

  const jsonPayload: EmotionXmlSchema = await xmlToJson(tryXmlText);

  const len = parseInt(jsonPayload.msg.emoji.$.len, 10) || 0;
  const width = parseInt(jsonPayload.msg.emoji.$.width, 10) || 0;
  const height = parseInt(jsonPayload.msg.emoji.$.height, 10) || 0;
  const cdnurl = jsonPayload.msg.emoji.$.cdnurl;

  return {
    cdnurl,
    height,
    len,
    width,
  };
}
