import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";
import * as PUPPET from "wechaty-puppet";
import { isContactOfficialId } from "../utils/is-type.js";

export function padLocalContactToWechaty(contact: PadLocal.Contact.AsObject): PUPPET.payloads.Contact {
  return {
    alias: contact.remark,
    avatar: contact.avatar,
    city: contact.city,
    friend: !contact.stranger,
    gender: contact.gender,
    id: contact.username,
    name: contact.nickname,
    phone: contact.phoneList,
    province: contact.province,
    signature: contact.signature,
    type: isContactOfficialId(contact.username) ? PUPPET.types.Contact.Official : PUPPET.types.Contact.Individual,
    weixin: contact.alias,
  };
}
