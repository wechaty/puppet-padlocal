/* eslint-disable camelcase */
import { parseTextWithRegexList } from "../../utils/regex.js";
import type { Runner } from "../../utils/runner.js";

export interface SysmsgTemplateXmlSchema {
  content_template: {
    $: {
      type: string;
    };
    plain: string;
    template: string;
    link_list: {
      link: [
        {
          $: {
            name: string;
            type: string;
            hidden?: string;
          };
          memberlist?: {
            member: [
              {
                username?: string;
                nickname: string;
              }
            ];
          };
          separator?: string;
          title?: string;
          usernamelist?: {
            username: string[];
          };
        }
      ];
    };
  };
}

export interface SysmsgTemplateLinkMember {
  userName?: string,
  nickName: string,
}

export type SysmsgTemplateLinkProfile = Array<SysmsgTemplateLinkMember>;

export interface SysmsgTemplateLinkRevoke {
  title: string,
  userNameList: string[],
}

export type SysmsgTemplateLinkType = "link_profile" | "link_revoke";

export type SysmsgTemplateLinkPayload = SysmsgTemplateLinkProfile | SysmsgTemplateLinkRevoke;

export interface SysmsgTemplateLink {
  name: string,
  payload: SysmsgTemplateLinkPayload,
  type: SysmsgTemplateLinkType,
}

export interface SysmsgTemplateMessagePayload {
  template: string;
  templateLinkList: Array<SysmsgTemplateLink>; // link list is sorted by template variable name order
}

/**
 * xmlToJson will return element instead of array if xml node only contains one child.
 * @param list
 */
function toList(list: any): any[] {
  if (!Array.isArray(list)) {
    return [list];
  } else {
    return list;
  }
}

export async function parseSysmsgTemplateMessagePayload(sysmsgTemplateXml: SysmsgTemplateXmlSchema): Promise<SysmsgTemplateMessagePayload> {
  const linkList = toList(sysmsgTemplateXml.content_template.link_list.link);

  const allLinkList = linkList.map((link): SysmsgTemplateLink  => {
    const type = link.$.type as SysmsgTemplateLinkType;
    let payload: SysmsgTemplateLinkPayload | undefined;

    if (type === "link_profile") {
      const memberList = toList(link.memberlist!.member);
      payload = memberList.map((member: { nickname: string; username?: string; }): SysmsgTemplateLinkMember => {
        return {
          nickName: member.nickname,
          userName: member.username,
        };
      });
    } else if (link.$.type === "link_revoke") {
      payload = {
        title: link.title!,
        userNameList: toList(link.usernamelist!.username),
      };
    } else {
      // handle more link type here
    }

    return {
      name: link.$.name,
      payload: payload!,
      type,
    };
  });

  const template = sysmsgTemplateXml.content_template.template;
  const matches = [...template.matchAll(/\$(.+?)\$/g)];

  const templateLinkList = matches.map(match => {
    const linkName = match[1];
    return allLinkList.filter((link) => link.name === linkName)[0]!;
  });

  return {
    template,
    templateLinkList,
  };
}

export type SysmsgTemplateHandler<T> = (templateLinkList: SysmsgTemplateLink[], matchedRegexIndex: number) => Promise<T>;

export async function parseSysmsgTemplate<T>(sysmsgTemplatePayload: SysmsgTemplateMessagePayload, regexList: RegExp[], handler: SysmsgTemplateHandler<T>) : Promise<T | null> {
  return parseTextWithRegexList(sysmsgTemplatePayload.template, regexList, async(matchedRegexIndex) => {
    return handler(sysmsgTemplatePayload.templateLinkList, matchedRegexIndex);
  });
}

export function createSysmsgTemplateRunner<T>(sysmsgTemplatePayload: SysmsgTemplateMessagePayload, regexList: RegExp[], handler: SysmsgTemplateHandler<T>): Runner<T> {
  return async() => parseSysmsgTemplate<T>(sysmsgTemplatePayload, regexList, handler);
}
