/* eslint-disable camelcase */
export interface TodoXmlSchema {
  op: string;
  todoid: string;
  username: string;
  path: string;
  time: number;
  custominfo: string;
  title: string;
  creator: string;
  related_msgid: string;
  manager: string;
  nreply: number;
  scene: string;
  oper: string;
  sharekey: string;
  sharename: string;
  template?: string;
}

export interface TodoMessagePayload {
  id: string;
  creatorUserName: string;
  operatorUserName: string;
  numberOfReply: number;
  appId: string;
  path: string;
  relatedMessageId: string;
  title: string;
  template?: string;
}

export async function parseTodoMessagePayload(todoXml: TodoXmlSchema): Promise<TodoMessagePayload> {
  return {
    appId: todoXml.username,
    creatorUserName: todoXml.creator,
    id: todoXml.todoid,
    numberOfReply: todoXml.nreply,
    operatorUserName: todoXml.oper,
    path: todoXml.path,
    relatedMessageId: todoXml.related_msgid,
    template: todoXml.template,
    title: todoXml.title,
  };
}
