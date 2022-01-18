export function getUserName (linkList: any, name: string) {
  const otherObjectArray = linkList.filter((link: any) => name.includes(link.$.name));

  if (!otherObjectArray || otherObjectArray.length === 0) {
    return null;
  }
  const otherObject = otherObjectArray[0];
  const inviteeList = otherObject.memberlist.member;

  const inviteeIdList = inviteeList.length ? inviteeList.map((i: any) => i.username) : inviteeList.username;
  return inviteeIdList;
}

export function getNickName (linkList: any, name: string) {
  const otherObjectArray = linkList.filter((link: any) => name.includes(link.$.name));

  if (!otherObjectArray || otherObjectArray.length === 0) {
    return null;
  }
  const otherObject = otherObjectArray[0];
  const inviteeList = otherObject.memberlist.member;

  const inviteeIdList = inviteeList.length ? inviteeList.map((i: any) => i.nickname) : inviteeList.nickname;
  return inviteeIdList;
}
