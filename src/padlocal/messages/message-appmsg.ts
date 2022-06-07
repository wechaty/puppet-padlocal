/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { xmlToJson } from "../utils/xml-to-json.js";

interface AppMsgXmlSchema {
  msg: {
    appmsg: {
      title: string;
      des: string;
      type: string;
      url: string;
      appattach: {
        totallen: string;
        attachid: string;
        emoticonmd5: string;
        fileext: string;
        cdnattachurl: string;
        cdnthumbaeskey: string;
        aeskey: string;
        encryver: string;
        islargefilemsg: string;
      };
      thumburl: string;
      md5: any;
      recorditem?: string;
      refermsg?: {
        type: string;
        svrid: string;
        fromusr: string;
        chatusr: string;
        displayname: string;
        content: string;
      };
    };
    fromusername: string;
    appinfo: {
      appname: any;
    };
  };
}

export enum AppMessageType {
  Text = 1,
  Img = 2,
  Audio = 3,
  Video = 4,
  Url = 5,
  Attach = 6,
  Open = 7,
  Emoji = 8,
  VoiceRemind = 9,
  ScanGood = 10,
  Good = 13,
  Emotion = 15,
  CardTicket = 16,
  RealtimeShareLocation = 17,
  ChatHistory = 19,
  MiniProgram = 33,
  MiniProgramApp = 36, // this is forwardable mini program
  GroupNote = 53,
  ReferMsg = 57,
  Transfers = 2000,
  RedEnvelopes = 2001,
  ReaderType = 100001,
}

export interface AppAttachPayload {
  totallen?: number;
  attachid?: string;
  emoticonmd5?: string;
  fileext?: string;
  cdnattachurl?: string;
  aeskey?: string;
  cdnthumbaeskey?: string;
  encryver?: number;
  islargefilemsg: number;
}

export interface ReferMsgPayload {
  type: string;
  svrid: string;
  fromusr: string;
  chatusr: string;
  displayname: string;
  content: string;
}

export interface AppMessagePayload {
  des?: string;
  thumburl?: string;
  title: string;
  url: string;
  appattach?: AppAttachPayload;
  type: AppMessageType;
  md5?: string;
  fromusername?: string;
  recorditem?: string;
  refermsg?: ReferMsgPayload;
}

export async function parseAppmsgMessagePayload(messageContent: string): Promise<AppMessagePayload> {
  const appMsgXml: AppMsgXmlSchema = await xmlToJson(messageContent);
  const { title, des, url, thumburl, type, md5, recorditem } = appMsgXml.msg.appmsg;

  let appattach: AppAttachPayload | undefined;
  const tmp = appMsgXml.msg.appmsg.appattach;
  if (tmp) {
    appattach = {
      aeskey: tmp.aeskey,
      attachid: tmp.attachid,
      cdnattachurl: tmp.cdnattachurl,
      cdnthumbaeskey: tmp.cdnthumbaeskey,
      emoticonmd5: tmp.emoticonmd5,
      encryver: (tmp.encryver && parseInt(tmp.encryver, 10)) || 0,
      fileext: tmp.fileext,
      islargefilemsg: (tmp.islargefilemsg && parseInt(tmp.islargefilemsg, 10)) || 0,
      totallen: (tmp.totallen && parseInt(tmp.totallen, 10)) || 0,
    };
  }

  return {
    appattach,
    des,
    md5,
    recorditem,
    refermsg: appMsgXml.msg.appmsg.refermsg,
    thumburl,
    title,
    type: parseInt(type, 10),
    url,
  };
}
