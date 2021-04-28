# PUPPET-PADLOCAL

[![NPM Version](https://badge.fury.io/js/wechaty-puppet-padlocal.svg)](https://www.npmjs.com/package/wechaty-puppet-padlocal)
[![Powered by Wechaty](https://img.shields.io/badge/Powered%20By-Wechaty-brightgreen.svg)](https://github.com/wechaty/wechaty)
[![Powered by padlocal-client-ts](https://img.shields.io/badge/Powered%20By-padlocal--client--ts-brightgreen)](https://github.com/padlocal/padlocal-client-ts)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-blue.svg)](https://www.typescriptlang.org/)
![Stage](https://img.shields.io/badge/Stage-beta-yellow)

## WECHATY PUPPET NEW STAR
> "New star from our community, which is the third most used Wechaty Puppet Provider now. Thank you very much @padlocal, for creating this WPP & WPS!"
> 
> — ⭐️ Wechaty [The Trends in March 2021](https://wechaty.js.org/2021/03/04/wechaty-puppet-providers-trends/)

Leading the puppet trends:

![img.png](https://user-images.githubusercontent.com/64943823/111100398-abd46c00-8582-11eb-93aa-c2e21d94265d.png)

## HOW TO USE
PadLocal is a complete Wechaty puppet implementation, **Zero Code Change** is needed to upgrade from old puppet. 
All you need to do is to set PadLocal as the puppet:
```
const bot = new Wechaty({
    name: "PadLocalBot",
    new PuppetPadlocal({ token: padLocalToken })
})
```
> Detailed tutorials to "[Get Started with PadLocal](https://github.com/padlocal/wechaty-puppet-padlocal/wiki/Get-Started-with-PadLocal)"

## HOW TO APPLY TOKEN
👉🏻 [pad-local.com](http://pad-local.com/) 👈🏻, get **FREE** trial token for **7** days.

## DESIGN CONCEPT
We adopt several advanced technologies which make us different and outstanding, including:
- Local IP: You use your own IP. No centralized server IPs are used, more secure.
- Local Device: You host your now puppet, no puppet state synchronization with servers, more robust. 
- Stateless High-Availability Service: **99.99%** SLA is guaranteed. Continuous integration is on the fly.

> Learn more about our implementation: [设计理念](https://github.com/padlocal/wechaty-puppet-padlocal/wiki/%E8%AE%BE%E8%AE%A1%E7%90%86%E5%BF%B5)

## PUPPET COMPARISON

PadLocal is _"one of"_ the most powerful puppet yet. 

Puppet|donut|wxwork|paimon|padlocal
:---|:---:|:---:|:---:|:---:
支持账号|个人微信|企业微信|个人微信|个人微信
**<消息>**|
收发文本|✅|✅|✅|✅
收发个人名片|✅|✅|✅|✅
收发图文链接|✅|✅|✅|✅
发送图片、文件|✅|✅|✅（较慢）|✅
接收图片、文件|✅|✅|✅|✅
发送视频|✅|✅|✅（较慢）|✅
接收视频|✅|✅|✅|✅
发送小程序|✅|✅|✅|✅
接收动图|❌|✅|❌|✅
发送动图|✅|✅|✅（以文件形式发送）|✅（以文件形式发送）
接收语音消息|✅|✅|❌|✅
发送语音消息|❌|❌|❌|✅
转发文本|✅|✅|✅|✅
转发图片|✅|✅|✅|✅
转发图文链接|✅|✅|❌|✅
转发音频|✅|✅|❌|✅
转发视频|✅|✅|✅|✅
转发文件|✅|✅|✅|✅
转发动图|❌|✅|❌|✅
转发小程序|✅|✅|✅|✅
**<群组>**|
创建群聊|✅|✅|✅|✅
设置群公告|✅|✅|✅|✅
获取群公告|❌|❌|✅|✅
群二维码|❌|❌|❌|✅
拉人进群|✅|✅|✅|✅
踢人出群|✅|✅|✅|✅
退出群聊|✅|❌|✅|✅
改群名称|✅|✅|❌|✅
入群事件|✅|✅|✅|✅
离群事件|✅|✅|✅|✅
群名称变更事件|✅|✅|❌|✅
@群成员|✅|✅|✅|✅
群列表|✅|✅|✅|✅
群成员列表|✅|✅|✅|✅
群详情|✅|✅|✅|✅
**<联系人>**|
修改备注|✅|✅|❌|✅
添加好友|✅|✅|❌|✅
自动通过好友|✅|✅|✅|✅
好友列表|✅|✅|✅|✅
好友详情|✅|✅|✅|✅
**<其他>**|
登录事件|✅|✅|✅|✅
扫码状态|❌|❌|❌|✅
登出事件|✅|✅|❌|✅
主动退出登录|✅|❌|✅|✅
依赖协议|Windows|Windows|iPad|iPad

> [Wechaty puppet compatibility](https://github.com/wechaty/wechaty-puppet/wiki/Compatibility)
