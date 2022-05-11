import { parseString } from "xml2js";
import { log } from "wechaty-puppet";

export async function xmlToJson(xml: string): Promise<any> {
  const firstIndex = xml.indexOf("<");
  if (firstIndex !== 0) {
    xml = xml.substring(firstIndex, xml.length);
  }

  return new Promise((resolve) => {
    parseString(xml, { explicitArray: false }, (err, result) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (err && Object.keys(err).length !== 0) {
        log.warn(JSON.stringify(err));
      }
      return resolve(result);
    });
  });
}
