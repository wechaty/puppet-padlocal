import PuppetPadlocal from "../src/puppet-padlocal";
import { Puppet, EventLoginPayload, EventLogoutPayload, EventScanPayload } from "wechaty-puppet";
import { log } from "wechaty";
import config from "config";

export const LOGPRE = "[test]";

type PreparePuppetFunc = (newPuppet: PuppetPadlocal) => Promise<void>;

export async function prepareSignedOnPuppet(prepareFunc?: PreparePuppetFunc, logPre: string = LOGPRE): Promise<Puppet> {
  return new Promise(async (resolve, reject) => {
    const host: string = config.get("padLocal.host");
    const port: number = config.get("padLocal.port");
    const token: string = config.get("padLocal.token");
    const tlsEnabled: boolean = config.get("padLocal.tls.enabled");
    const serverCAFilePath: string = config.get("padLocal.tls.serverCAFilePath");

    const puppet = new PuppetPadlocal({
      endpoint: `${host}:${port}`,
      token,
      serverCAFilePath: tlsEnabled ? serverCAFilePath : undefined,
    });

    /**
     *
     * 2. Register event handlers for Bot
     *
     */
    puppet
      .on("scan", (payload: EventScanPayload) => {
        if (payload.qrcode) {
          // Generate a QR Code online via
          // http://goqr.me/api/doc/create-qr-code/
          const qrcodeImageUrl = [
            "https://api.qrserver.com/v1/create-qr-code/?data=",
            encodeURIComponent(payload.qrcode),
          ].join("");
          log.info(logPre, `on scan: [${payload.status}] ${qrcodeImageUrl}\nScan QR Code above to log in: `);
        } else {
          log.info(logPre, `on scan: [${payload.status}]`);
        }
      })

      .on("login", (payload: EventLoginPayload) => {
        log.info(logPre, `${payload.contactId} login`);
      })

      .on("ready", () => {
        resolve(puppet);
      })

      .on("logout", (payload: EventLogoutPayload) => {
        log.info(logPre, `${payload.contactId} logout: ${payload.data}`);
      })

      .on("error", (payload) => {
        log.error(logPre, `on error: ${payload.data}`);

        reject(payload.data);
      });

    if (prepareFunc) {
      await prepareFunc(puppet);
    }

    try {
      await puppet.start();
    } catch (e) {
      log.error(logPre, "Bot start() fail:", e);
      reject(e);
    }
  });
}
