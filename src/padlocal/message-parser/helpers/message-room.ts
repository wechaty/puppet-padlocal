export interface RoomXmlSchema {
  sysmsg: {
    $: {
      type: string;
    };
    sysmsgtemplate: {
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
    };
  };
}
