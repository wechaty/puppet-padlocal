#!/usr/bin/env node
import { log, ScanStatus, WechatyBuilder } from "wechaty";
import PuppetPadlocal from "wechaty-puppet-padlocal";

/**
 * get qr code as smoke test.
 */
async function testGetBotQRCode() {
  const token: string | undefined = process.env.NODE_PADLOCAL_TOKEN;
  if (!token) {
    throw new Error("NODE_PADLOCAL_TOKEN is required, please set it up in Secrets for github action.");
  }

  const bot = WechatyBuilder.build({
    name: "SmokeTestBot",
    puppet:  new PuppetPadlocal({ token }),
  });

  try {
    await bot.start();

    await new Promise((resolve, reject) => {
      // wait for 10 seconds to get QR code
      const timeout = setTimeout(() => {
        reject("Get QRCode timeout");
      }, 60000);

      bot.on("scan", (qrcode: string, status: ScanStatus) => {
        if (status === ScanStatus.Waiting && qrcode) {
          log.info(
            "SmokeTestBot",
            `onScan: ${ScanStatus[status]}(${status})`,
          );

          clearTimeout(timeout);
          resolve(true);
        }
      })
    })
  }
  finally {
    await bot.stop();
  }
}

async function main() {
  try {
    await testGetBotQRCode();
  }
  catch (e) {
    console.error(e)
    // Error!
    return 1
  }

  return 0;
}

main()
  .then(process.exit)
  .catch(e => {
    console.error(e)
    process.exit(1)
  })



