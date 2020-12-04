# PUPPET-PADLOCAL

[![NPM Version](https://badge.fury.io/js/wechaty-puppet-padlocal.svg)](https://www.npmjs.com/package/wechaty-puppet-padlocal)
[![Powered by Wechaty](https://img.shields.io/badge/Powered%20By-Wechaty-brightgreen.svg)](https://github.com/wechaty/wechaty)
[![Powered by padlocal-client-ts](https://img.shields.io/badge/Powered%20By-padlocal--client--ts-brightgreen)](https://github.com/padlocal/padlocal-client-ts)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-blue.svg)](https://www.typescriptlang.org/)
![Stage](https://img.shields.io/badge/Stage-beta-yellow)

*NOTICE: our dev machines are all Macs, may not adapt other platforms perfectly at the moment. If you have any problems during using this puppet, issues are welcome to [open](https://github.com/padlocal/wechaty-puppet-padlocal/issues/new).*   

## HOW TO USE

### Play with Wechaty
PadLocal is a complete Wechaty puppet implementation. You can use all the Wechaty apis as always. 👉🏻 https://github.com/wechaty/wechaty#guitar-api

All you need to do is to provide PadLocal as Wechaty puppet:

```
const bot = new Wechaty({
    name: "PadLocalBot",
    new PuppetPadlocal({ token: padLocalToken })
})
```

### wechaty-puppet-padlocal-demo
Also, we provided a simple [demo project](https://github.com/padlocal/wechaty-puppet-padlocal-demo) to show how to use padlocal puppet. You can checkout this repo to see how it works.

If you want to explore PadLocal step by step, following instructions may be helpful.

### Step by step instructions
#### 1. Check your Node version first, >= v12
```
node --version // >= v12.0.0
``` 
#### 2. Create and init your bot project
```
mkdir my-padlocal-bot && cd my-padlocal-bot
npm init -y
npm install ts-node typescript -g --registry=https://r.npm.taobao.org
tsc --init --target ES6
``` 
#### 3. Install Wechaty and Padlocal puppet
```
npm install wechaty@latest --registry=https://r.npm.taobao.org
npm install wechaty-puppet-padlocal@latest --registry=https://r.npm.taobao.org
```

#### 4. Write bot demo code

```
// bot.ts

import {PuppetPadlocal} from "wechaty-puppet-padlocal";
import {Contact, Message, ScanStatus, Wechaty} from "wechaty";

const token: string = ""            // padlocal token
const puppet = new PuppetPadlocal({ token })

const bot = new Wechaty({
    name: "TestBot",
    puppet,
})

bot
.on("scan", (qrcode: string, status: ScanStatus) => {
    if (status === ScanStatus.Waiting && qrcode) {
        const qrcodeImageUrl = ["https://api.qrserver.com/v1/create-qr-code/?data=", encodeURIComponent(qrcode)].join("");
        console.log(`onScan: ${ScanStatus[status]}(${status}) - ${qrcodeImageUrl}`);
    } else {
        console.log(`onScan: ${ScanStatus[status]}(${status})`);
    }
})

.on("login", (user: Contact) => {
    console.log(`${user} login`);
})

.on("logout", (user: Contact) => {
    console.log(`${user} logout`);
})

.on("message", async (message: Message) => {
    console.log(`on message: ${message.toString()}`);
})

.start()

console.log("TestBot", "started");
```
```
ts-node bot.ts
```
## PUPPET COMPARISON

功能 | padpro | padplus | macpro | padlocal
---|---|---|---|---
 **<消息>**|  |  |
 收发文本| ✅ |✅ |✅|✅
 收发个人名片| ✅ |✅ |✅|✅
 收发图文链接| ✅ |✅ |✅|✅
 发送图片、文件| ✅ | ✅（对内容有大小限制，20M以下） |✅|✅
 接收图片、文件| ✅ | ✅（对内容有大小限制，25M以下） |✅|✅
 发送视频| ✅ | ✅ | ✅|✅
 接收视频| ✅ | ✅ | ✅|✅
 发送小程序| ❌ | ✅ | ✅|✅
 接收动图| ❌ | ✅ | ✅|✅
 发送动图| ❌ | ✅ | ✅|✅
 接收语音消息| ✅ | ✅ | ✅|✅
 发送语音消息| ✅ | ❌ | ❌|✅
 转发文本| ✅ | ✅ | ✅|✅
 转发图片| ✅ | ✅ | ✅|✅
 转发图文链接| ✅ | ✅ | ✅|✅
 转发音频| ✅ | ❌ | ✅|✅
 转发视频| ✅ | ✅ | ✅|✅
 转发文件| ✅ | ✅ | ✅|✅
 转发动图| ❌ | ❌ | ❌|❌
 转发小程序| ❌ | ✅ | ❌|✅
 **<群组>**|  |  |  |
 创建群聊|✅|✅|✅|✅
 设置群公告|✅|✅|✅|✅
 获取群公告|❌|✅|❌|✅
 群二维码|✅|✅|✅|✅
 拉人进群|✅|✅|✅|✅
 踢人出群|✅|✅|✅|✅
 退出群聊|✅|✅|✅|✅
 改群名称|✅|✅|✅|✅
 入群事件|✅|✅|✅|✅
 离群事件|✅|✅|✅|✅
 群名称变更事件|✅|✅|✅|✅
 @群成员|✅|✅|✅|✅
 群列表|✅|✅|✅|✅
 群成员列表|✅|✅|✅|✅
 群详情|✅|✅|✅|✅
 **<联系人>**|  |  |
 修改备注|✅|✅|✅|✅
 添加好友|✅|✅|✅|✅
 自动通过好友|✅|✅|❌|✅
 添加好友|✅|✅|✅|✅
 好友列表|✅|✅|✅|✅
 好友详情|✅|✅|✅|✅
 **<其他>**|  |  |  |
 登录微信|✅|✅|✅|✅
 扫码状态|✅|✅|❌|✅
 退出微信|✅|✅|✅|✅
 依赖协议|iPad|iPad|Mac|iPad
 
 ## HOW TO GET TOKEN
 Padlocal is in **beta testing** stage, granting tokens to limited partners. If you want to apply, please [contact admin](mailto:oxddoxdd@gmail.com) for further information.
