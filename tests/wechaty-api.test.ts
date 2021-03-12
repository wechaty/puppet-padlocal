import config from "config";
import { Contact, FileBox, Message, MiniProgram, UrlLink, Wechaty } from "wechaty";
import { prepareSingedOnBot } from "./wechaty-common";
import { MessageType, MiniProgramPayload } from "wechaty-puppet";
import { EmojiMessagePayload } from "../src/padlocal/message-parser/helpers/message-emotion";
import PuppetPadlocal from "../src/puppet-padlocal";

let bot: Wechaty;

beforeAll(async () => {
  bot = await prepareSingedOnBot();
});

afterAll(async () => {
  await bot.stop();
});

describe("contact", () => {
  test("set self name", async () => {
    const self = bot.userSelf();

    const oldName = self.name();
    console.log(`old name: ${oldName}`);

    const toName: string = config.get("test.contact.changeNickName");

    await self.name(toName);

    const newName = self.name();
    expect(newName).toEqual(toName);
    console.log(`new name: ${newName}`);
  });

  test("self qr code", async () => {
    const self = bot.userSelf();
    const qrStr = await self.qrcode();
    expect(qrStr.length).toBeGreaterThan(0);

    console.log(`qr: ${qrStr}`);
  });

  test("set self signature", async () => {
    const toSignature: string = config.get("test.contact.changeSignature");
    const self = bot.userSelf();
    await self.signature(toSignature);
  });

  test("set other contact alias", async () => {
    const userName: string = config.get("test.contact.alias.userName");
    const toAlias: string = config.get("test.contact.alias.aliasName");

    const contact = (await bot.Contact.find({ id: userName }))!;
    const oldAlias = await contact.alias();
    console.log(`old alias: ${oldAlias}`);

    await contact.alias(toAlias);

    const newAlias = await contact.alias();
    expect(newAlias).toEqual(toAlias);

    console.log(`new alias: ${newAlias}`);
  });

  test("contact avatar", async () => {
    const selfContact = bot.userSelf();
    const selfAvatarFileBox = await selfContact.avatar();
    expect(selfAvatarFileBox).toBeTruthy();

    const userName: string = config.get("test.contact.getAvatarUserName");
    const contact = (await bot.Contact.find({ id: userName }))!;
    const otherAvatar = await contact.avatar();
    expect(otherAvatar).toBeTruthy();
  });

  test("contact list", async () => {
    const contactList = await bot.Contact.findAll();
    expect(contactList.length).toBeGreaterThan(0);
  });

  test("delete contact", async () => {
    const deleteUserName: string = config.get("test.contact.deleteUserName");

    const puppet: PuppetPadlocal = bot.puppet as PuppetPadlocal;
    await puppet.contactDelete(deleteUserName);

    const contact = await bot.Contact.find({ id: deleteUserName });
    expect(contact!.friend()).toBeFalsy();
  });
});

describe("tag", () => {
  const userName: string = config.get("test.tag.targetUserName");
  const tagName: string = config.get("test.tag.addDeleteTagName");

  test("add user tag", async () => {
    const tag = await bot.Tag.get(tagName);
    const contact = await bot.Contact.find({ id: userName });
    await tag.add(contact!);
  });

  test("delete user tag", async () => {
    const tag = await bot.Tag.get(tagName);
    const contact = await bot.Contact.find({ id: userName });
    await tag.remove(contact!);
  });

  test("delete tag", async () => {
    const tag = await bot.Tag.get(tagName);
    await bot.Tag.delete(tag);
  });

  test("get contact tag list", async () => {
    const contact = await bot.Contact.find({ id: userName });
    const tags = await contact!.tags();
    console.log(tags);
  });
});

describe("friendship", () => {
  const hello: string = config.get("test.friendship.add.hello");

  test("accept", async () => {
    const friendshipId: string = config.get("test.friendship.acceptId");
    const friendship = await bot.Friendship.load(friendshipId);
    await friendship.ready();
    await friendship.accept();
  });

  test("add", async () => {
    const userName: string = config.get("test.friendship.add.userName");
    const contact = await bot.Contact.find({ id: userName });
    expect(contact).toBeTruthy();

    await bot.Friendship.add(contact!, hello);
  });

  test("search phone ", async () => {
    const searchPhone: string = config.get("test.friendship.search.phone");
    const contact = await bot.Friendship.search({ phone: searchPhone });
    expect(contact).toBeTruthy();

    await bot.Friendship.add(contact!, hello);
  });

  test("search weixin ", async () => {
    const searchWeixin: string = config.get("test.friendship.search.weixin");
    const contact = await bot.Friendship.search({ weixin: searchWeixin });
    expect(contact).toBeTruthy();

    await bot.Friendship.add(contact!, hello);
  });
});

const toChatRoomId: string = config.get("test.message.send.chatroomId");
const toUserName: string = config.get("test.message.send.toUserName");

const expectSendMessage = async (message: Message, expectedMessageType: MessageType) => {
  const selfContact = bot.userSelf();
  expect(message).toBeTruthy();
  expect(message.from()!.id).toEqual(selfContact.id);
  expect(message.to() || message.room()).toBeTruthy();
  expect(message.type()).toBe(expectedMessageType);
  expect(message.date()).toBeTruthy();
};

const sendToContact = async (payload: any, expectedMessageType: MessageType, toUser?: string): Promise<Message> => {
  const to = toUser || toUserName;
  const toContact = await bot.Contact.load(to);
  const message = (await toContact.say(payload)) as Message;

  await expectSendMessage(message, expectedMessageType);

  return message;
};

const sendToRoom = async (
  payload: any,
  expectedMessageType: MessageType,
  toRoomId?: string,
  ...mentionList: Contact[]
): Promise<Message> => {
  const to = toRoomId || toChatRoomId;
  const toRoom = await bot.Room.load(to);
  const message = (await toRoom.say(payload, ...mentionList)) as Message;

  await expectSendMessage(message, expectedMessageType);

  return message;
};

describe("message", () => {
  const sendMessage = async (payload: any, expectedMessageType: MessageType): Promise<Message[]> => {
    const message1 = await sendToContact(payload, expectedMessageType);
    const message2 = await sendToRoom(payload, expectedMessageType);

    return [message1, message2];
  };

  const recallMessages = async (messageList: Message[]) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await messageList[0].recall();

    await new Promise((resolve) => setTimeout(resolve, 1000));
    await messageList[1].recall();
  };

  test("send text message", async () => {
    const text = `hello padlocal: ${Date.now()}`;
    await sendMessage(text, MessageType.Text);
  });

  test("send text message with at user list", async () => {
    const atUserList: string[] = config.get("test.message.send.chatroomAtUserList");

    const text = `hello padlocal: ${Date.now()}`;

    const contactList = [];
    for (const contactId of atUserList) {
      const contact = await bot.Contact.find({ id: contactId });
      contactList.push(contact!);
    }
    await sendToRoom(text, MessageType.Text, undefined, ...contactList);
  });

  test("recall text message", async () => {
    const messageList = await sendMessage(`hi: ${Date.now()}`, MessageType.Text);
    await recallMessages(messageList);
  });

  const sendContactCardMessage = async (): Promise<Message[]> => {
    const contactCardId: string = config.get("test.message.send.contactCardId");
    const contact = (await bot.Contact.find({ id: contactCardId }))!;

    return sendMessage(contact, MessageType.Text);
  };

  test("send contact card message", async () => {
    await sendContactCardMessage();
  });

  test("recall contact card message", async () => {
    const messageList = await sendContactCardMessage();

    await recallMessages(messageList);
  });

  const sendImageMessage = async (): Promise<Message[]> => {
    const imageFilePath: string = config.get("test.message.send.imageFilePath");
    const fileBox = FileBox.fromFile(imageFilePath);

    return sendMessage(fileBox, MessageType.Text);
  };

  test("send image message", async () => {
    await sendImageMessage();
  });

  test("recall image message", async () => {
    const messageList = await sendImageMessage();

    await recallMessages(messageList);
  });

  const sendVoiceMessage = async (): Promise<Message[]> => {
    const voiceFilePath: string = config.get("test.message.send.voiceFilePath");
    const voiceLength: number = config.get("test.message.send.voiceLength");

    const fileBox = FileBox.fromFile(voiceFilePath);
    fileBox.mimeType = "audio/silk";
    fileBox.metadata = {
      voiceLength,
    };

    return sendMessage(fileBox, MessageType.Text);
  };

  test("send voice message", async () => {
    await sendVoiceMessage();
  }, 20000);

  test("recall voice message", async () => {
    const messageList = await sendVoiceMessage();

    await recallMessages(messageList);
  }, 20000);

  const sendVideoMessage = async (): Promise<Message[]> => {
    const videoFilePath: string = config.get("test.message.send.videoFilePath");
    const fileBox = FileBox.fromFile(videoFilePath);

    return sendMessage(fileBox, MessageType.Text);
  };

  test("send video message", async () => {
    await sendVideoMessage();
  }, 20000);

  test("recall video message", async () => {
    const messageList = await sendVideoMessage();

    await recallMessages(messageList);
  }, 20000);

  const sendFileMessage = async (): Promise<Message[]> => {
    const fileFilePath: string = config.get("test.message.send.fileFilePath");
    const fileBox = FileBox.fromFile(fileFilePath);

    return sendMessage(fileBox, MessageType.Text);
  };

  test("send file message", async () => {
    await sendFileMessage();
  }, 300000);

  test("recall file message", async () => {
    const messageList = await sendFileMessage();
    await recallMessages(messageList);
  }, 20000);

  const sendLinkMessage = async (): Promise<Message[]> => {
    const title: string = config.get("test.message.send.link.title");
    const description: string = config.get("test.message.send.link.description");
    const url: string = config.get("test.message.send.link.url");
    const thumbImageUrl: string = config.get("test.message.send.link.thumbImageUrl");

    const urlLink = new UrlLink({
      title,
      description,
      thumbnailUrl: thumbImageUrl,
      url,
    });

    return sendMessage(urlLink, MessageType.Url);
  };

  test("send link message", async () => {
    await sendLinkMessage();
  });

  test("recall link message", async () => {
    const messageList = await sendLinkMessage();
    await recallMessages(messageList);
  }, 10000);

  const sendMiniProgramMessageThumbCdn = async (): Promise<Message[]> => {
    const miniProgramPayload: MiniProgramPayload = config.get("test.message.send.miniProgram");
    const miniProgram = new MiniProgram(miniProgramPayload);
    return sendMessage(miniProgram, MessageType.MiniProgram);
  };

  const sendMiniProgramMessageThumbHttp = async (): Promise<Message[]> => {
    const miniProgramPayload: MiniProgramPayload = Object.assign({}, config.get("test.message.send.miniProgram"));

    miniProgramPayload.thumbUrl = config.get("test.message.send.miniProgramThumbURLHttp");
    miniProgramPayload.thumbKey = undefined;

    const miniProgram = new MiniProgram(miniProgramPayload);
    return sendMessage(miniProgram, MessageType.MiniProgram);
  };

  test(
    "send miniprogram message",
    async () => {
      await sendMiniProgramMessageThumbCdn();
      await sendMiniProgramMessageThumbHttp();
    },
    30 * 1000
  );

  test("recall miniprogram message", async () => {
    const messageList = await sendMiniProgramMessageThumbCdn();
    await recallMessages(messageList);
  });

  const sendEmojiMessage = async (): Promise<Message[]> => {
    const emotionPayload: EmojiMessagePayload = config.get("test.message.send.emoji");
    const emoticonBox = FileBox.fromUrl(emotionPayload.cdnurl, `message-test-emotion.jpg`, {
      ...emotionPayload,
    });

    emoticonBox.mimeType = "emoticon";

    return sendMessage(emoticonBox, MessageType.Emoticon);
  };

  test("send emoticon message", async () => {
    await sendEmojiMessage();
  });

  test("recall emoticon message", async () => {
    const messageList = await sendEmojiMessage();
    await recallMessages(messageList);
  });
});

describe("room", () => {
  const chatroomId: string = config.get("test.room.chatroomId");

  test("create room", async () => {
    const memberList: string[] = config.get("test.room.create.memberUserNameList");
    const roomName: string = config.get("test.room.create.roomName");

    const contactList = [];
    for (const userName of memberList) {
      const contact = await bot.Contact.find({ id: userName });
      contactList.push(contact!);
    }

    const newRoom = await bot.Room.create(contactList, roomName);
    expect(newRoom).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await newRoom.ready();

    const newRoomTopic = await newRoom.topic();
    expect(newRoomTopic).toEqual(roomName);

    const newRoomMemberList = await newRoom.memberAll();
    expect(newRoomMemberList.length).toEqual(3);

    await sendToRoom("hello", MessageType.Text, newRoom.id);
  });

  test("room member list", async () => {
    const room = (await bot.Room.find({ id: chatroomId }))!;

    const memberList = await room.memberAll();

    console.log(memberList);

    expect(memberList).toBeTruthy();
    expect(memberList.length).toBeGreaterThan(0);
  });

  test("room delete member", async () => {
    const memberUserName: string = config.get("test.room.delete.memberUserName");

    const room = (await bot.Room.find({ id: chatroomId }))!;
    const contact = await bot.Contact.find({ id: memberUserName });

    const oldMemberList = await room.memberAll();

    await room.del(contact!);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const newMemberList = await room.memberAll();
    expect(newMemberList.length).toEqual(oldMemberList.length - 1);
  });

  test("room add member", async () => {
    const room = (await bot.Room.find({ id: chatroomId }))!;

    const userName: string = config.get("test.room.add.memberUserName");
    const contact = await bot.Contact.find({ id: userName });

    const oldMemberList = await room.memberAll();

    await room!.add(contact!);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const newMemberList = await room.memberAll();
    expect(newMemberList.length).toEqual(oldMemberList.length + 1);
  });

  test("room avatar", async () => {
    const room = await bot.Room.find({ id: chatroomId });

    const avatarFileBox = await room!.avatar();
    expect(avatarFileBox).toBeTruthy();
  });

  test("get room list", async () => {
    const allRooms = await bot.Room.findAll();
    expect(allRooms.length).toBeGreaterThan(0);
  });

  test("room qr", async () => {
    const room = (await bot.Room.find({ id: chatroomId }))!;
    const qrString = await room.qrCode();

    console.log(`qr: ${qrString}`);

    expect(qrString).toBeTruthy();
  });

  test("room topic", async () => {
    const room = (await bot.Room.find({ id: chatroomId }))!;

    const toName: string = config.get("test.room.topic.changeName");
    await room.topic(toName);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const newTopic = await room.topic();
    expect(newTopic).toEqual(toName);
  });

  test("room announce", async () => {
    const room = (await bot.Room.find({ id: chatroomId }))!;

    const newAnnouncement: string = config.get("test.room.announce.newAnnouncement");
    await room.announce(newAnnouncement);

    const announcement = await room.announce();
    expect(announcement).toEqual(newAnnouncement);
  });

  test("room quit", async () => {
    const roomId: string = config.get("test.room.quit.id");

    const room = (await bot.Room.find({ id: roomId }))!;
    await room.quit();
  });

  test("accept room invitation", async () => {
    const roomInvitationId: string = config.get("test.room.invitation.id");
    const roomInvitation = bot.RoomInvitation.load(roomInvitationId);
    await roomInvitation.accept();
  });
});
