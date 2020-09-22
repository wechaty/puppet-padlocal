import { FileBox, MessageType, Puppet } from "wechaty-puppet";
import { prepareSignedOnPuppet } from "./puppet-padlocal-common";
import config from "config";

let puppet: Puppet;

beforeAll(async () => {
  puppet = await prepareSignedOnPuppet();
});

afterAll(async () => {
  await puppet.stop();
});

describe("contact", () => {
  test("set self name", async () => {
    const toName: string = config.get("test.contact.changeNickName");
    await puppet.contactSelfName(toName);
  });

  test("self qr code", async () => {
    const qrStr = await puppet.contactSelfQRCode();
    expect(qrStr.length).toBeGreaterThan(0);
  });

  test("set self signature", async () => {
    const toSignature: string = config.get("test.contact.changeSignature");
    await puppet.contactSelfSignature(toSignature);
  });

  test("set other contact alias", async () => {
    const userName: string = config.get("test.contact.alias.userName");
    const toAlias: string = config.get("test.contact.alias.aliasName");
    await puppet.contactAlias(userName, toAlias);
  });

  test("contact avatar", async () => {
    const selfAvatar = await puppet.contactAvatar(puppet.selfId());
    expect(selfAvatar).toBeTruthy();

    const userName: string = config.get("test.contact.getAvatarUserName");
    const otherAvatar = await puppet.contactAvatar(userName);
    expect(otherAvatar).toBeTruthy();
  });

  test("contact list", async () => {
    const contactList = await puppet.contactList();
    expect(contactList.length).toBeGreaterThan(0);
  });
});

describe("tag", () => {
  const userName: string = config.get("test.tag.targetUserName");
  const tagName: string = config.get("test.tag.addDeleteTagName");

  test("add user tag", async () => {
    await puppet.tagContactAdd(tagName, userName);
  });

  test("delete user tag", async () => {
    await puppet.tagContactRemove(tagName, userName);
  });

  test("delete tag", async () => {
    await puppet.tagContactDelete(tagName);

    await expect(puppet.tagContactDelete("tag_not_exits")).rejects.toThrow();
  });

  test("get contact tag list", async () => {
    const allTagList = await puppet.tagContactList();
    expect(allTagList.length).toBeGreaterThan(0);

    const tagList = await puppet.tagContactList("userName");
    expect(tagList.length).toBeGreaterThan(0);
  });
});

describe("friendship", () => {
  test("accept", async () => {
    const friendshipId: string = config.get("test.friendship.acceptId");
    await puppet.friendshipAccept(friendshipId);
  });

  test("add", async () => {
    const userName: string = config.get("test.friendship.add.userName");
    const hello: string = config.get("test.friendship.add.hello");
    await puppet.friendshipAdd(userName, hello);
  });

  test("search phone ", async () => {
    const searchPhone: string = config.get("test.friendship.search.phone");
    const contactId = await puppet.friendshipSearchPhone(searchPhone);

    expect(contactId).toBeTruthy();
  });

  test("search weixin ", async () => {
    const searchWeixin: string = config.get("test.friendship.search.weixin");
    const contactId = await puppet.friendshipSearchWeixin(searchWeixin);

    expect(contactId).toBeTruthy();
  });
});

describe("message", () => {
  const toChatRoomId: string = config.get("test.message.send.chatroomId");
  const toUserName: string = config.get("test.message.send.toUserName");

  const expectSendMessage = async (messageId: string) => {
    const messagePayload = await puppet.messagePayload(messageId);
    expect(messagePayload).toBeTruthy();
    expect(messagePayload.id).toBeTruthy();
    expect(messagePayload.type).toBe(MessageType.Text);
    expect(messagePayload.fromId).toBe(puppet.selfId());
    expect(messagePayload.toId).toBeTruthy();
  };

  const sendTextMessage = async (): Promise<string> => {
    const messageId: string = (await puppet.messageSendText(toChatRoomId, `hi: ${Date.now()}`)) as string;

    await expectSendMessage(messageId);

    return messageId;
  };

  test("send text", async () => {
    await sendTextMessage();
  });

  test("recall message", async () => {
    const messageId = await sendTextMessage();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await puppet.messageRecall(messageId);
  });

  test("send contact card", async () => {
    const contactCardId: string = config.get("test.message.send.contactCardId");

    const messageId = (await puppet.messageSendContact(toChatRoomId, contactCardId)) as string;
    expect(messageId).toBeTruthy();

    await expectSendMessage(messageId);
  });

  test("send image", async () => {
    const imageFilePath: string = config.get("test.message.send.imageFilePath");
    const fileBox = FileBox.fromFile(imageFilePath);
    const messageId = await puppet.messageSendFile(toUserName, fileBox);

    console.log(`send image message id: ${messageId}`);

    expect(messageId).toBeTruthy();
  });

  test("send voice", async () => {
    const voiceFilePath: string = config.get("test.message.send.voiceFilePath");
    const voiceLength: number = config.get("test.message.send.voiceLength");

    const fileBox = FileBox.fromFile(voiceFilePath);
    fileBox.mimeType = "audio/silk";
    fileBox.metadata = {
      voiceLength,
    };

    const messageId = await puppet.messageSendFile(toChatRoomId, fileBox);

    console.log(`send voice message id: ${messageId}`);

    expect(messageId).toBeTruthy();
  });

  test("send video", async () => {
    const videoFilePath: string = config.get("test.message.send.videoFilePath");
    const fileBox = FileBox.fromFile(videoFilePath);

    const messageId = await puppet.messageSendFile(toUserName, fileBox);

    console.log(`send video message id: ${messageId}`);

    expect(messageId).toBeTruthy();
  });

  test("send file", async () => {
    const fileFilePath: string = config.get("test.message.send.fileFilePath");
    const fileBox = FileBox.fromFile(fileFilePath);

    const messageId = await puppet.messageSendFile(toUserName, fileBox);

    console.log(`send file message id: ${messageId}`);

    expect(messageId).toBeTruthy();
  });
});

describe("room", () => {
  const chatroomId: string = config.get("test.room.chatroomId");

  test("room add", async () => {
    const userName: string = config.get("test.room.add.memberUserName");
    await puppet.roomAdd(chatroomId, userName);
  });

  test("room avatar", async () => {
    const avatarFileBox = await puppet.roomAvatar(chatroomId);
    expect(avatarFileBox).toBeTruthy();
  });

  test("create room", async () => {
    const memberList: string[] = config.get("test.room.create.memberUserNameList");
    const roomName: string = config.get("test.room.create.roomName");
    const roomId = await puppet.roomCreate(memberList, roomName);

    console.log(`room created: ${roomId}`);
    expect(roomId).toBeTruthy();
  });

  test("room delete", async () => {
    const memberUserName: string = config.get("test.room.delete.memberUserName");
    await puppet.roomDel(chatroomId, memberUserName);
  });

  test("get room list", async () => {
    const roomList = await puppet.roomList();
    expect(roomList.length).toBeGreaterThan(0);
  });

  test("room qr", async () => {
    const qrString = await puppet.roomQRCode(chatroomId);
    expect(qrString).toBeTruthy();
  });

  test("room topic", async () => {
    const toName: string = config.get("test.room.topic.changeName");
    await puppet.roomTopic(chatroomId, toName);

    await puppet.roomTopic(chatroomId);
  });

  test("room announce", async () => {
    await puppet.roomAnnounce(chatroomId);

    const newAnnouncement: string = config.get("test.room.announce.newAnnouncement");
    await puppet.roomAnnounce(chatroomId, newAnnouncement);
  });

  test("room member", async () => {
    const memberList = await puppet.roomMemberList(chatroomId);
    expect(memberList).toBeTruthy();
    expect(memberList.length).toBeGreaterThan(0);
  });

  test("room quit", async () => {
    const roomId: string = config.get("test.room.quit.id");
    await puppet.roomQuit(roomId);
  });
});
