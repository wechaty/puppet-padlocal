import { Message } from "padlocal-client-ts/dist/proto/padlocal_pb";
import { Puppet, FriendshipPayloadConfirm, FriendshipPayloadVerify, FriendshipType } from "wechaty-puppet";
import { FriendshipPayloadReceive } from "wechaty-puppet/src/schemas/friendship";
import { isContactId, isIMContactId } from "../utils/is-type";
import { xmlToJson } from "../utils/xml-to-json";
import { MessageParserRetType } from "./message-parser";
import { WechatMessageType } from "./WechatMessageType";

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

const isConfirm = (message: Message.AsObject): boolean => {
  return FRIENDSHIP_CONFIRM_REGEX_LIST.some((regexp) => {
    return !!message.content.match(regexp);
  });
};

const isNeedVerify = (message: Message.AsObject): boolean => {
  return FRIENDSHIP_VERIFY_REGEX_LIST.some((regexp) => {
    return !!message.content.match(regexp);
  });
};

const isReceive = async (message: Message.AsObject): Promise<ReceiveXmlSchema | null> => {
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

export default async (_puppet: Puppet, message: Message.AsObject): Promise<MessageParserRetType> => {
  if (isConfirm(message)) {
    return {
      contactId: message.fromusername,
      id: message.id,
      timestamp: message.createtime,
      type: FriendshipType.Confirm,
    } as FriendshipPayloadConfirm;
  } else if (isNeedVerify(message)) {
    return {
      contactId: message.fromusername,
      id: message.id,
      timestamp: message.createtime,
      type: FriendshipType.Verify,
    } as FriendshipPayloadVerify;
  } else {
    const verifyXml = await isReceive(message);
    if (verifyXml) {
      return {
        contactId: verifyXml.msg.$.fromusername,
        hello: verifyXml.msg.$.content,
        id: message.id,
        scene: parseInt(verifyXml.msg.$.scene, 10),
        stranger: verifyXml.msg.$.encryptusername,
        ticket: verifyXml.msg.$.ticket,
        timestamp: message.createtime,
        type: FriendshipType.Receive,
        sourceNickName: verifyXml.msg.$.sourcenickname,
        sourceContactId: verifyXml.msg.$.sourceusername,
        shareCardNickName: verifyXml.msg.$.sharecardnickname,
        shareCardContactId: verifyXml.msg.$.sharecardusername,
      } as FriendshipPayloadReceive;
    }

    return null;
  }
};
