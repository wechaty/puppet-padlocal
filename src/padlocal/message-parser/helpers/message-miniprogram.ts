import { MiniProgramPayload } from "wechaty-puppet";
import { Message } from "padlocal-client-ts/dist/proto/padlocal_pb";
import { xmlToJson } from "../../utils/xml-to-json";

interface MiniProgramXmlSchema {
  msg: {
    appmsg: {
      title: string;
      sourcedisplayname: string;
      appattach: {
        cdnthumbaeskey: string;
        cdnthumburl: string;
      };
      weappinfo: {
        username: string;
        appid: string;
        pagepath: string;
        weappiconurl: string;
        shareId: string;
      };
      thumburl: string;
      md5: any;
    };
    fromusername: string;
  };
}

export async function miniProgramMessageParser(rawPayload: Message.AsObject): Promise<MiniProgramPayload> {
  const miniProgramXml: MiniProgramXmlSchema = await xmlToJson(rawPayload.content);
  const appmsg = miniProgramXml.msg.appmsg;
  const weappinfo = appmsg.weappinfo;
  const appattach = appmsg.appattach;

  return {
    appid: weappinfo.appid,
    username: weappinfo.username,
    title: appmsg.title,
    description: appmsg.sourcedisplayname,
    pagePath: weappinfo.pagepath,
    iconUrl: weappinfo.weappiconurl,
    shareId: weappinfo.shareId,
    thumbUrl: appattach.cdnthumburl,
    thumbKey: appattach.cdnthumbaeskey,
  };
}
