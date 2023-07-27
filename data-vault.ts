import { keccak256 } from 'js-sha3';
import { JByte, JByteArray, JSerialize, JString, JLong, serialize, prepareToSendTx, txSignature, getRandomLong } from './ostypes';
import { WebSocketModule } from './ws-module';
import { encryptCBC, decryptCBC, generateRandomIV, uint8ArrayToBase64, base64ToUint8Array } from "./encrypt"
const axlsign = require("axlsign");

export function nodeIdTag(nodeId: string, tag: string): JSerialize[] {
    return [new JString(nodeId), new JString(tag)];
}

  
export enum dvCmd {
    Upsert = 1,
    Delete = 2,
    ConfirmSync = 3,
    SyncConfirm = 4,
}

export function left(v: JSerialize): JSerialize[] { return [new JByte(0), v]; }

export function right(v: JSerialize[]): JSerialize[] {
    const r: JSerialize[] = [new JByte(1)];
    return r.concat(v);
}

export type EitherEncOrStr = (string | EncryptedValue);

export function dataVaultTx(
    cmd: number,
    key: string,
    ver: number,
    blockHeight: number,
    value: EitherEncOrStr,
    uniqueMessage: number): JSerialize[] {

    var either: JSerialize[];

    if (typeof value === "string") {
        either = left(new JString(value));
    } else {
        either = right(encryptedValue(value as EncryptedValue));
    }

    const partial: JSerialize[] = [
        new JLong(blockHeight),
        new JByte(cmd),
        new JString(key),
        new JLong(ver),
    ];

    return (partial
        .concat(either))
        .concat([new JLong(uniqueMessage)])
}

export class EncryptedValue {
    encBase64: string;
    iv: string;
    ephermalPubKey: string;
    nodeId: string;
    tag: string;

    constructor(
        encBase64: string,
        iv: string,
        ephermalPubKey: string,
        nodeId: string,
        tag: string
    ) {
        this.encBase64 = encBase64;
        this.iv = iv;
        this.ephermalPubKey = ephermalPubKey;
        this.nodeId = nodeId;
        this.tag = tag;
    }
}



export function encryptedValue(
    encValue: EncryptedValue): JSerialize[] {

    const pKeyMustBeByteAry = base64ToUint8Array(encValue.ephermalPubKey)    

    const enc = [
        new JString(encValue.encBase64),
        new JString(encValue.iv),
        new JByteArray(pKeyMustBeByteAry),
        new JString(encValue.nodeId),
        new JString(encValue.tag),
    ];

    return [new JByteArray(serialize(enc))];
}


export class DataVault implements KeyData {
    private privateKey: Uint8Array;
    private publicKey: Uint8Array;
    private nodeId: string;
    private tag: string;
    private ws: WebSocketModule;

    private dvLedgerId = 80; //magic number identifying the Data Vault ledger

    constructor(
        keyPair: { privateKey: Uint8Array; publicKey: Uint8Array },
        nodeId: string,
        tag: string,
        ws: WebSocketModule) {
        this.privateKey = keyPair.privateKey;
        this.publicKey = keyPair.publicKey;
        this.nodeId = nodeId;
        this.tag = tag;
        this.ws = ws;

    }

    async decryptIfNecessary(value: (string | EncryptedValue)): Promise<string> {
        let newValue: Promise<string>;
        if(typeof value === 'string') {
            newValue = new Promise((resolve) =>  resolve(value));
        } else {
            newValue = this.decrypt(value);
        }            
        return newValue;
    }

    async keys(): Promise<Map<string, ValVer>> {
        return this.ws.send<string>("keys", this.nodeId).then(async s => {
            const jsonObject = JSON.parse(s);
            const result: Map<string,ValVer > = new Map();

            for (const key of Object.keys(jsonObject)) {
                result.set(key, jsonObject[key]);
              }

            console.log("S " + s)
        
            const transformedPromises = Array.from(result.entries()).map(async ([k, value]) => {
                // Return a Promise for each value transformation
                const dec = this.decryptIfNecessary(value.value);
                
                return dec;
              });

            const transformed = await Promise.all(transformedPromises);
            
            var i = 0;
            result.forEach((value, key) => {                
                console.log("Value:" + transformed[i] + " key:" + key);
                result.set(key, { value: transformed[i], version: value.version });
                i++;
            })
            for(const e in result.entries()) {
                console.log("e " + e[0] + e[1]);
            }
            
            return result;            
        });
                
    }

    async decrypt(enc: EncryptedValue): Promise<string> {
        const encValue = base64ToUint8Array(enc.encBase64);
        const iv = base64ToUint8Array(enc.iv);
        const ephermalPubKey = base64ToUint8Array(enc.ephermalPubKey);
        const sharedSecret = axlsign.sharedKey(this.privateKey, ephermalPubKey);
        const sessionKey = keccak256.array(sharedSecret);
        return decryptCBC(iv, new Uint8Array(sessionKey), encValue);
    }

    async encrypt(value: string): Promise<EncryptedValue> {
        const seedArray = new Uint8Array(32);

        // Generate random values and fill the array with them
        crypto.getRandomValues(seedArray);
        const epmermalKPair = axlsign.generateKeyPair(seedArray);
        const sharedSecret = axlsign.sharedKey(epmermalKPair.private, this.publicKey);
        const sessionKey = keccak256.array(sharedSecret);
        const iv = generateRandomIV();
        return encryptCBC(iv, new Uint8Array(sessionKey), value).then(encBytes => {
            const encBytesBase64Str = uint8ArrayToBase64(encBytes);
            const ivBase64Str = uint8ArrayToBase64(iv);
            const pKey = uint8ArrayToBase64(epmermalKPair.public);
            return new EncryptedValue(
                encBytesBase64Str,
                ivBase64Str,
                pKey,
                this.nodeId,
                this.tag
            );
        });
    }

    async set(key: string, value: string, version: number): Promise<UpdateResult> {
        const randomLong = getRandomLong();
        const blockheight = await this.ws.send<number>("blockheight", "");
        console.log("Got height" + blockheight);
        const encValue: EncryptedValue = await this.encrypt(value);
        const tx = dataVaultTx(dvCmd.Upsert, key, version, blockheight, encValue, randomLong);
        const txBytes = serialize(tx);
        const sigs = txSignature(this.privateKey, this.nodeId, this.tag, txBytes);
        const messageToSend = prepareToSendTx(this.dvLedgerId, sigs, txBytes);
        const dataForSendAsBytes = serialize(messageToSend);
        return withTimeout(
            this.ws.sendBin(dataForSendAsBytes)
            , 8000).then(s => {
                console.log(s)
                return { success: JSON.parse(s) };
            })
            .catch((e) => {
                return { error: e.toString() };
            });

    }
}

interface ValVer {
    value: string,
    version: number
}
export class MemoryKeyData implements KeyData {

    private data: Map<string, ValVer>;

    constructor(data: Map<string, ValVer>) {
        this.data = data;
    }
    

    async keys(): Promise< Map<string, ValVer>> {
        const keyEntries = Array.from(this.data.entries());
        const keys: Map<string, ValVer> = new Map();

        await Promise.all(keyEntries.map(async ([key, { value, version }]) => {
            keys.set(key, { value, version });
        }));

        return keys;
    }


    async set(key: string, value: string, version: number): Promise<UpdateResult> {
        try {
            // Simulate some async operation here (e.g., database query or API call).
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Update the data in the in-memory map.
            this.data.set(key, { value, version });

            // Return the timestamp of the update as the result.
            return { success: { key: key, version: version } };
        } catch (err) {
            // Return the error in case of failure.
            return { error: err.toString() };
        }
    }
}

export interface UpdateResult {
    success?: { key: string; version: number };
    error?: string; // Error if the update failed
}

export interface KeyData {
    keys(): Promise< Map<string, ValVer>>;
    set(key: string, value: string, version: number): Promise<UpdateResult>;
}


export async function syncData(
    localPersist: KeyData,
    remotePersist: KeyData
): Promise<[string, Promise<UpdateResult>][]> {

    return Promise.all([
        localPersist.keys(),
        remotePersist.keys(),
    ]).then(([localKeys, remoteKeys]) => {
        
    const allKeys = [...localKeys.keys(),...remoteKeys.keys()];
    const uniqueAllKeys = [...new Set(allKeys)];

    const syncPromises: [string, Promise<UpdateResult>][] = [];
    
    uniqueAllKeys.forEach(key => {
        const localData = localKeys.get(key);
        const remoteData = remoteKeys.get(key);
        
    
        if (!localData) {
            // Key exists only in remotePersist, update localPersist
            console.log("Add remote to local " + key + " " + remoteData!.version + " " + remoteData!.value);
            syncPromises.push([key, localPersist.set(key, remoteData!.value, remoteData!.version)]);
        } else if (!remoteData) {
            // Key exists only in localPersist, update remotePersist
            console.log("Add local to remote " + key + " " + localData!.version + " " + localData!.value);
            syncPromises.push([key, remotePersist.set(key, localData.value, localData.version)]);
        } else if (localData.version > remoteData.version) {
            // Version in localPersist is higher, update remotePersist
            throw new Error("Impossible! local version: ${localData.version} > remote: ${remoteData.version}");
        } else if (localData.version < remoteData.version) {
            // Version in remotePersist is higher, update localPersist
            console.log("Update local from remote " + key + " " + remoteData!.version + " " + remoteData!.value);
            syncPromises.push([key, localPersist.set(key, remoteData.value, remoteData.version)]);
        } else if (localData.version == remoteData.version && localData.value != remoteData.value) {
            console.log("Update remote from local " + key + " " + localData!.version + " " + localData!.value);
            syncPromises.push([key, remotePersist.set(key, localData.value, localData.version)]);
        }

    })

    return syncPromises;
    })
}


// Helper function to handle Promise timeouts
function withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error("Promise timeout"));
        }, timeout);

        promise
            .then((result) => {
                clearTimeout(timeoutId);
                resolve(result);
            })
            .catch((error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
    });
}
