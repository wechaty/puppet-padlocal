import { parseString } from "xml2js";
import { log } from "brolog";

export async function xmlToJson(xml: string): Promise<any> {
  return new Promise((resolve) => {
    parseString(xml, { explicitArray: false }, (err, result) => {
      if (err && Object.keys(err).length !== 0) {
        log.warn(JSON.stringify(err));
      }
      return resolve(result);
    });
  });
}
