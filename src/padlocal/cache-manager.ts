import fs from "fs-extra";
import os from "os";
import path from "path";
import LRU from "lru-cache";

import type * as PUPPET from "wechaty-puppet";
import { log } from "wechaty-puppet";
import { FlashStore } from "flash-store";
import type PadLocal from "padlocal-client-ts/dist/proto/padlocal_pb.js";

const PRE = "[CacheManager]";

export type RoomMemberMap = { [contactId: string]: PadLocal.ChatRoomMember.AsObject };

export class CacheManager {

  private readonly _userName: string;

  private _messageCache?: LRU<string, PadLocal.Message.AsObject>; // because message count may be massive, so we just keep them in memory with LRU and with limited capacity
  private _messageRevokeCache?: LRU<string, PadLocal.MessageRevokeInfo.AsObject>;
  private _contactCache?: FlashStore<string, PadLocal.Contact.AsObject>;
  private _contactSearchCache?: LRU<string, PadLocal.SearchContactResponse.AsObject>;
  private _contactStrangerAliasCache?: FlashStore<string, string>; // set alias before add contact
  private _roomCache?: FlashStore<string, PadLocal.Contact.AsObject>;
  private _roomMemberCache?: FlashStore<string, RoomMemberMap>;
  private _roomInvitationCache?: FlashStore<string, PUPPET.payloads.RoomInvitation>;
  private _friendshipCache?: FlashStore<string, PUPPET.payloads.Friendship>;

  private _labelList?: PadLocal.Label[];

  constructor(userName: string) {
    this._userName = userName;
  }

  async init(): Promise<void> {
    if (this._messageCache) {
      throw new Error("already initialized");
    }

    const baseDir = path.join(
      os.homedir(),
      path.sep,
      ".wechaty",
      "puppet-padlocal-cache",
      path.sep,
      this._userName,
      path.sep,
    );

    const baseDirExist = await fs.pathExists(baseDir);
    if (!baseDirExist) {
      await fs.mkdirp(baseDir);
    }

    this._messageCache = new LRU<string, PadLocal.Message.AsObject>({
      dispose(key: string, val: any) {
        log.silly(PRE, "constructor() lruOptions.dispose(%s, %s)", key, JSON.stringify(val));
      },
      max: 1000,
      maxAge: 1000 * 60 * 60,
    });

    this._messageRevokeCache = new LRU<string, PadLocal.MessageRevokeInfo.AsObject>({
      dispose(key: string, val: any) {
        log.silly(PRE, "constructor() lruOptions.dispose(%s, %s)", key, JSON.stringify(val));
      },
      max: 1000,
      maxAge: 1000 * 60 * 60,
    });

    this._contactCache = new FlashStore(path.join(baseDir, "contact-raw-payload"));
    this._contactSearchCache = new LRU<string, PadLocal.SearchContactResponse.AsObject>({
      dispose(key: string, val: any) {
        log.silly(PRE, "constructor() lruOptions.dispose(%s, %s)", key, JSON.stringify(val));
      },
      max: 1000,
      maxAge: 1000 * 60 * 60,
    });
    this._contactStrangerAliasCache = new FlashStore(path.join(baseDir, "contact-stranger-alias"));
    this._roomCache = new FlashStore(path.join(baseDir, "room-raw-payload"));
    this._roomMemberCache = new FlashStore(path.join(baseDir, "room-member-raw-payload"));
    this._roomInvitationCache = new FlashStore(path.join(baseDir, "room-invitation-raw-payload"));
    this._friendshipCache = new FlashStore(path.join(baseDir, "friendship-raw-payload"));

    const contactTotal = await this._contactCache.size;

    log.silly(PRE, `initCache() inited ${contactTotal} Contacts,  cachedir="${baseDir}"`);
  }

  async close() {
    log.silly(PRE, "close()");

    if (
      this._contactCache
      && this._contactStrangerAliasCache
      && this._roomMemberCache
      && this._roomCache
      && this._friendshipCache
      && this._roomInvitationCache
      && this._messageCache
    ) {
      log.silly(PRE, "close() closing caches ...");

      await Promise.all([
        this._contactCache.close(),
        this._contactStrangerAliasCache.close(),
        this._roomMemberCache.close(),
        this._roomCache.close(),
        this._friendshipCache.close(),
        this._roomInvitationCache.close(),
      ]);

      this._contactCache = undefined;
      this._contactStrangerAliasCache = undefined;
      this._roomMemberCache = undefined;
      this._roomCache = undefined;
      this._friendshipCache = undefined;
      this._roomInvitationCache = undefined;
      this._messageCache = undefined;

      log.silly(PRE, "close() cache closed.");
    } else {
      log.silly(PRE, "close() cache not exist.");
    }
  }

  /**
   * -------------------------------
   * Message Section
   * --------------------------------
   */
  public async getMessage(messageId: string): Promise<PadLocal.Message.AsObject | undefined> {
    return this._messageCache!.get(messageId);
  }

  public async setMessage(messageId: string, payload: PadLocal.Message.AsObject): Promise<void> {
    await this._messageCache!.set(messageId, payload);
  }

  public async hasMessage(messageId: string): Promise<boolean> {
    return this._messageCache!.has(messageId);
  }

  public async getMessageRevokeInfo(messageId: string): Promise<PadLocal.MessageRevokeInfo.AsObject | undefined> {
    return this._messageRevokeCache!.get(messageId);
  }

  public async setMessageRevokeInfo(messageId: string, messageSendResult: PadLocal.MessageRevokeInfo.AsObject): Promise<void> {
    await this._messageRevokeCache!.set(messageId, messageSendResult);
  }

  /**
   * -------------------------------
   * Contact Section
   * --------------------------------
   */
  public async getContact(contactId: string): Promise<PadLocal.Contact.AsObject | undefined> {
    return this._contactCache!.get(contactId);
  }

  public async setContact(contactId: string, payload: PadLocal.Contact.AsObject): Promise<void> {
    await this._contactCache!.set(contactId, payload);
  }

  public async deleteContact(contactId: string): Promise<void> {
    await this._contactCache!.delete(contactId);
  }

  public async getContactIds(): Promise<string[]> {
    const result: string[] = [];
    for await (const key of this._contactCache!.keys()) {
      result.push(key);
    }

    return result;
  }

  public async getAllContacts(): Promise<PadLocal.Contact.AsObject[]> {
    const result: PadLocal.Contact.AsObject[] = [];
    for await (const value of this._contactCache!.values()) {
      result.push(value);
    }
    return result;
  }

  public async hasContact(contactId: string): Promise<boolean> {
    return this._contactCache!.has(contactId);
  }

  public async getContactCount(): Promise<number> {
    return this._contactCache!.size;
  }

  /**
   * contact search
   */

  public async getContactSearch(id: string): Promise<PadLocal.SearchContactResponse.AsObject | undefined> {
    return this._contactSearchCache!.get(id);
  }

  public async setContactSearch(id: string, payload: PadLocal.SearchContactResponse.AsObject): Promise<void> {
    await this._contactSearchCache!.set(id, payload);
  }

  public async hasContactSearch(id: string): Promise<boolean> {
    return this._contactSearchCache!.has(id);
  }

  public async getContactStrangerAlias(encryptedUserName: string): Promise<string | undefined> {
    return this._contactStrangerAliasCache!.get(encryptedUserName);
  }

  public async setContactStrangerAlias(encryptedUserName: string, alias: string): Promise<void> {
    await this._contactStrangerAliasCache!.set(encryptedUserName, alias);
  }

  public async deleteContactStrangerAlias(encryptedUserName: string): Promise<void> {
    await this._contactStrangerAliasCache!.delete(encryptedUserName);
  }

  /**
   * -------------------------------
   * Room Section
   * --------------------------------
   */
  public async getRoom(roomId: string): Promise<PadLocal.Contact.AsObject | undefined> {
    return this._roomCache!.get(roomId);
  }

  public async setRoom(roomId: string, payload: PadLocal.Contact.AsObject): Promise<void> {
    await this._roomCache!.set(roomId, payload);
  }

  public async deleteRoom(roomId: string): Promise<void> {
    await this._roomCache!.delete(roomId);
  }

  public async getRoomIds(): Promise<string[]> {
    const result: string[] = [];
    for await (const key of this._roomCache!.keys()) {
      result.push(key);
    }
    return result;
  }

  public async getRoomCount(): Promise<number> {
    return this._roomCache!.size;
  }

  public async hasRoom(roomId: string): Promise<boolean> {
    return this._roomCache!.has(roomId);
  }

  /**
   * -------------------------------
   * Room Member Section
   * --------------------------------
   */
  public async getRoomMember(roomId: string): Promise<RoomMemberMap | undefined> {
    return this._roomMemberCache!.get(roomId);
  }

  public async setRoomMember(roomId: string, payload: RoomMemberMap): Promise<void> {
    await this._roomMemberCache!.set(roomId, payload);
  }

  public async deleteRoomMember(roomId: string): Promise<void> {
    await this._roomMemberCache!.delete(roomId);
  }

  /**
   * -------------------------------
   * Room Invitation Section
   * -------------------------------
   */
  public async getRoomInvitation(messageId: string): Promise<PUPPET.payloads.RoomInvitation | undefined> {
    return this._roomInvitationCache!.get(messageId);
  }

  public async setRoomInvitation(messageId: string, payload: PUPPET.payloads.RoomInvitation): Promise<void> {
    await this._roomInvitationCache!.set(messageId, payload);
  }

  public async deleteRoomInvitation(messageId: string): Promise<void> {
    await this._roomInvitationCache!.delete(messageId);
  }

  /**
   * -------------------------------
   * Friendship Cache Section
   * --------------------------------
   */
  public async getFriendshipRawPayload(id: string): Promise<PUPPET.payloads.Friendship | undefined> {
    return this._friendshipCache!.get(id);
  }

  public async setFriendshipRawPayload(id: string, payload: PUPPET.payloads.Friendship) {
    await this._friendshipCache!.set(id, payload);
  }

  public getLabelList(): PadLocal.Label[] | undefined {
    return this._labelList;
  }

  public setLabelList(labelList: PadLocal.Label[]): void {
    this._labelList = labelList;
  }

}
