export interface PatXmlSchema {
  fromusername: string;
  chatusername: string;
  pattedusername: string;
  template: string;
}

export interface PatMessagePayload {
  fromUserName: string;
  chatUserName: string;
  pattedUserName: string;
  template: string;
}

export async function parsePatMessagePayload(patXml: PatXmlSchema): Promise<PatMessagePayload> {
  return {
    chatUserName: patXml.chatusername,
    fromUserName: patXml.fromusername,
    pattedUserName: patXml.pattedusername,
    template: patXml.template,
  };
}
