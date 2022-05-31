/* eslint-disable camelcase */
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
                username: string;
                nickname: string;
              }
            ];
          };
          separator?: string;
          title?: string;
          usernamelist?: {
            username: string;
          };
        }
      ];
    };
  };
}

export interface SysmsgTemplateLinkMember {
  userName: string,
  nickName: string,
}

export interface SysmsgTemplateLink {
  name: string,
  memberList?: Array<SysmsgTemplateLinkMember>
}

export interface SysmsgTemplateMessagePayload {
  template: string;
  linkList: Array<SysmsgTemplateLink>;
}

export async function parseSysmsgTemplateMessagePayload(sysmsgTemplateXml: SysmsgTemplateXmlSchema): Promise<SysmsgTemplateMessagePayload> {
  const linkList = sysmsgTemplateXml.content_template.link_list.link.map(link => {
    const memberList = link.memberlist?.member.map(member => {
      return {
        nickName: member.nickname,
        userName: member.username,
      };
    });

    return {
      memberList,
      name: link.$.name,
    };
  });

  return {
    linkList,
    template: sysmsgTemplateXml.content_template.template,
  };
}

export function getLinkWithTemplatePlaceHolderName(payload: SysmsgTemplateMessagePayload, placeHolderName: string) : SysmsgTemplateLink {
  const links : Array<SysmsgTemplateLink> = payload.linkList.filter(link => placeHolderName.includes(link.name));
  return links[0]!;
}
