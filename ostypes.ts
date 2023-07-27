import * as utf8 from 'utf8';
const axlsign = require("axlsign");
import { keccak256 } from 'js-sha3';


export function prepareToSendTx(
  ledgerId: number,
  sigs: JSerialize[], 
  txBytes: Uint8Array): OSSerializable {
  var result: OSSerializable = [new JByte(ledgerId)];
  const r2 = result.concat(sigs);
  r2.push(txBytes);  
  return r2;
}

export function txSignature(
  privKey: Uint8Array,
  nodeId: string, 
  tag: string, 
  txAsAry: Uint8Array): JSerialize[] {

  const h = keccak256.array(txAsAry);
  const sigAsBytes: Uint8Array =  axlsign.sign(privKey, new Uint8Array(h));

  return [
    new JByteArray(stringToUTF8Array(nodeId)), 
    new JByteArray(stringToUTF8Array(tag)), 
    new JByteArray(sigAsBytes)
  ];
}

export interface JSerialize {
  serialize(): Uint8Array
}

export function hasJSerialize(obj: any): obj is JSerialize {
  return typeof obj === 'object' && obj !== null && 'serialize' in obj && typeof obj.serialize === 'function';
}

export type OSSerializable = (string | Uint8Array | JSerialize)[];

// Serialize a list of primitives into an array of bytes
export function serialize(data: OSSerializable): Uint8Array {
  
  const elements: Uint8Array[] = [];

  data.forEach((item) => {
  
    if (typeof item === "string") {
      const s = new JString(item);    
      elements.push(s.serialize());      
    } else if (hasJSerialize(item)) {
      elements.push(item.serialize())
    } else if (item instanceof(Uint8Array)) {
      elements.push(item);
    } else {
      console.log("Not handling " + typeof item);
    }
  });

  const totalLength = elements.reduce((acc, el) => acc + el.byteLength, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  elements.forEach((el) => {
    result.set(el, offset);
    offset += el.byteLength;
  });

  return result;
}

export class JLong implements JSerialize {
  private readonly value: BigInt;


  static MAX_VALUE = BigInt("9223372036854775807");
  static MIN_VALUE = BigInt("-9223372036854775808");

  constructor(value: number | string ) {
    const bigIntValue = BigInt(value);

    if (bigIntValue > JLong.MAX_VALUE.valueOf() || bigIntValue < JLong.MIN_VALUE.valueOf()) {
      throw new Error(`Value out of range. Expected value between ${JLong.MAX_VALUE} and ${JLong.MIN_VALUE}`);
    }

    this.value = bigIntValue;
  }

  getValue(): BigInt {
    return this.value;
  }

  toString(): string {
    return this.value.toString();
  }

  serialize(): Uint8Array {
    const buffer = new ArrayBuffer(8); // 8 bytes to represent a 64-bit number
    const dataView = new DataView(buffer);

  
    // Use setFloat64 or setBigInt64 if available (TS 4.1+)
    if (typeof dataView.setBigUint64 === 'function') {
        dataView.setBigInt64(0, this.value as bigint, false); // true for little-endian
    } else {
        throw new Error(`Value out of range. Expected value between ${Number.MIN_SAFE_INTEGER} and ${Number.MAX_SAFE_INTEGER}`);
        // Fallback for older environments that don't support BigInt
        //dataView.setUint32(0, number >>> 0, true);
        //dataView.setUint32(4, (number / 4294967296) >>> 0, true);
    }

    return new Uint8Array(buffer);
  }

}

export class JByte implements JSerialize {

  private readonly value: Uint8Array = new Uint8Array(1);

  constructor(value: number) {

    if(value > 127 || value < -128) {
      throw new Error(`Value out of range. Expected value between 127 and -128`);
    }
    const dataView = new DataView(this.value.buffer);
    dataView.setInt8(0, value);    
  }

  serialize(): Uint8Array {     
    return this.value; 
  }
  
}

export class JByteArray implements JSerialize {

  private readonly value: Uint8Array;

  constructor(value: Uint8Array) {
    this.value = value;
  }

  serialize(): Uint8Array { 
  
    const length = new ArrayBuffer(4);
    const lengthView = new DataView(length);
    lengthView.setInt32(0, this.value.byteLength);
    const result = new Uint8Array(4 + this.value.byteLength);
    result.set(new Uint8Array(length));
    result.set(this.value, 4);
    return result;
  
  }
  
}

function stringToUTF8Array(inputString: string): Uint8Array {
  const encodedString = utf8.encode(inputString);
  const byteArray = new Uint8Array(encodedString.length);
  for (let i = 0; i < encodedString.length; i++) {
    byteArray[i] = encodedString.charCodeAt(i);
  }
  return byteArray;
}

export class JString implements JSerialize {

  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }
 

  serialize(): Uint8Array { 
   
   const textBytes = stringToUTF8Array(this.value);
   const lengthBuffer = new ArrayBuffer(2);
   const lengthView = new DataView(lengthBuffer);
   lengthView.setInt16(0, textBytes.byteLength);
   const result = new Uint8Array(2 + textBytes.byteLength);
   result.set(new Uint8Array(lengthBuffer));
   result.set(textBytes, 2);
   return result;   
  }
}

export function getRandomLong(): number {
  // Generate two random 32-bit integers and combine them into a 64-bit integer
  const highPart = Math.floor(Math.random() * 0x100000000); // Random integer between 0 and 2^32 - 1
  const lowPart = Math.floor(Math.random() * 0x100000000); // Random integer between 0 and 2^32 - 1

  // Use bitwise operators to shift the high part to the left and combine with the low part
  return (highPart << 32) | lowPart;
}

