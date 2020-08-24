import { Puppet } from "wechaty-puppet";
import { prepareSignedOnPuppet } from "./common";
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
    // TODO:
    const toSignature: string = config.get("test.contact.changeSignature");
    await puppet.contactSelfSignature(toSignature);
  });

  test("set other contact alias", async () => {
    // TODO:
    const userName: string = config.get("test.contact.alias.userName");
    const toAlias: string = config.get("test.contact.alias.aliasName");
    await puppet.contactAlias(userName);

    await puppet.contactAlias(userName, toAlias);
  });

  test("contact avatar", async () => {
    const selfAvatar = await puppet.contactAvatar(puppet.selfId());
    expect(selfAvatar).toBeTruthy();

    const userName: string = config.get("test.contact.getAvatarUserName");
    const otherAvatar = await puppet.contactAvatar(userName);
    expect(otherAvatar).toBeTruthy();
  }, 1000000);

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
  test("send text", async () => {
    const toUserName: string = config.get("test.message.send.chatroomId");
    await puppet.messageSendText(toUserName, "hi");
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
});
