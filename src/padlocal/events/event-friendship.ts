import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import * as PUPPET from "wechaty-puppet";
import { isContactId, isIMContactId } from "../utils/is-type.js";
import { xmlToJson } from "../utils/xml-to-json.js";
import type { EventPayload } from "./event.js";
import { WechatMessageType } from "../types.js";

const FRIENDSHIP_CONFIRM_REGEX_LIST = [
  /^You have added (.+) as your WeChat contact. Start chatting!$/,
  /^你已添加了(.+)，现在可以开始聊天了。$/,
  /I've accepted your friend request. Now let's chat!$/,
  /^(.+) just added you to his\/her contacts list. Send a message to him\/her now!$/,
  /^(.+)刚刚把你添加到通讯录，现在可以开始聊天了。$/,
  /^我通过了你的朋友验证请求，现在我们可以开始聊天了$/,
];

const FRIENDSHIP_VERIFY_REGEX_LIST = [
  /^(.+) has enabled Friend Confirmation/,
  /^(.+)开启了朋友验证，你还不是他（她）朋友。请先发送朋友验证请求，对方验证通过后，才能聊天。/,
];

interface ReceiveXmlSchema {
  msg: {
    $: {
      fromusername: string;
      encryptusername: string;
      content: string;
      scene: string;
      ticket: string;
      sourcenickname?: string;
      sourceusername?: string;
      sharecardnickname?: string;
      sharecardusername?: string;
    };
  };
}

const isConfirm = (message: PadLocal.Message.AsObject): boolean => {
  return FRIENDSHIP_CONFIRM_REGEX_LIST.some((regexp) => {
    return !!message.content.match(regexp);
  });
};

const isNeedVerify = (message: PadLocal.Message.AsObject): boolean => {
  return FRIENDSHIP_VERIFY_REGEX_LIST.some((regexp) => {
    return !!message.content.match(regexp);
  });
};

const isReceive = async(message: PadLocal.Message.AsObject): Promise<ReceiveXmlSchema | null> => {
  if (message.type !== WechatMessageType.VerifyMsg && message.type !== WechatMessageType.VerifyMsgEnterprise) {
    return null;
  }

  try {
    const verifyXml: ReceiveXmlSchema = await xmlToJson(message.content);
    const contactId = verifyXml.msg.$.fromusername;
    if (isContactId(contactId) && verifyXml.msg.$.encryptusername) {
      return verifyXml;
    } else if (isIMContactId(contactId)) {
      return verifyXml;
    }
  } catch (e) {
    // not receive event
  }

  return null;
};

export default async(_puppet: PUPPET.Puppet, message: PadLocal.Message.AsObject): Promise<EventPayload> => {
  if (isConfirm(message)) {
    return {
      contactId: message.fromusername,
      id: message.id,
      timestamp: message.createtime,
      type: PUPPET.types.Friendship.Confirm,
    } as PUPPET.payloads.FriendshipConfirm;
  } else if (isNeedVerify(message)) {
    return {
      contactId: message.fromusername,
      id: message.id,
      timestamp: message.createtime,
      type: PUPPET.types.Friendship.Verify,
    } as PUPPET.payloads.FriendshipVerify;
  } else {
    const verifyXml = await isReceive(message);
    if (verifyXml) {
      return {
        contactId: verifyXml.msg.$.fromusername,
        hello: verifyXml.msg.$.content,
        id: message.id,
        scene: parseInt(verifyXml.msg.$.scene, 10),
        shareCardContactId: verifyXml.msg.$.sharecardusername,
        shareCardNickName: verifyXml.msg.$.sharecardnickname,
        sourceContactId: verifyXml.msg.$.sourceusername,
        sourceNickName: verifyXml.msg.$.sourcenickname,
        stranger: verifyXml.msg.$.encryptusername,
        ticket: verifyXml.msg.$.ticket,
        timestamp: message.createtime,
        type: PUPPET.types.Friendship.Receive,
      } as PUPPET.payloads.FriendshipReceive;
    }

    return null;
  }
};
