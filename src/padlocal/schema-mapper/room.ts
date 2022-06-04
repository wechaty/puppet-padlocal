import PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import type * as PUPPET from "wechaty-puppet";

export function padLocalRoomToWechaty(contact: PadLocal.Contact.AsObject): PUPPET.payloads.Room {
  return {
    adminIdList: [],
    avatar: contact.avatar,
    id: contact.username,
    memberIdList: contact.chatroommemberList.map((member) => member.username),
    ownerId: contact.chatroomownerusername,
    topic: contact.nickname,
  };
}

export function padLocalRoomMemberToWechaty(chatRoomMember: PadLocal.ChatRoomMember.AsObject): PUPPET.payloads.RoomMember {
  return {
    avatar: chatRoomMember.avatar,
    id: chatRoomMember.username,
    inviterId: chatRoomMember.inviterusername,
    name: chatRoomMember.nickname,
    roomAlias: chatRoomMember.displayname,
  };
}

export function chatRoomMemberToContact(chatRoomMember: PadLocal.ChatRoomMember): PadLocal.Contact {
  return new PadLocal.Contact()
    .setUsername(chatRoomMember.getUsername())
    .setNickname(chatRoomMember.getNickname())
    .setAvatar(chatRoomMember.getAvatar())
    .setStranger(true);
}
