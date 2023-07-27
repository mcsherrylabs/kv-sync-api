
export function uint8ArrayToBase64(uint8Array: Uint8Array) {
    let binary = '';
    uint8Array.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}

export function base64ToUint8Array(base64String: string): Uint8Array {
    const binaryString = atob(base64String);
    const len = binaryString.length;
    const uintArray = new Uint8Array(len);
  
    for (let i = 0; i < len; i++) {
      uintArray[i] = binaryString.charCodeAt(i);
    }
  
    return uintArray;
  }

// Function to generate a random initialization vector (IV)
export function generateRandomIV(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(16));
}

// Function to perform CBC encryption
export async function encryptCBC(
    iv: Uint8Array,
    key: Uint8Array,
    plaintext: string): Promise<Uint8Array> {

    const textEncoder = new TextEncoder();
    const algorithm = { name: 'AES-CBC', iv };

    // Import the key
    const importedKey = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt']);

    // Convert the plaintext to Uint8Array
    const data = textEncoder.encode(plaintext);

    // Perform the encryption
    const ciphertext = crypto.subtle.encrypt(algorithm, importedKey, data).then(c => {
        return new Uint8Array(c);
    });

    return ciphertext;
}

export async function decryptCBC(iv: Uint8Array, 
    key: Uint8Array, 
    encryptedData: Uint8Array): Promise<string> {

    const algorithm = { name: 'AES-CBC', iv };

    // Import the key
    const importedKey = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['decrypt']);

    // Perform the decryption
    const decryptedData = await crypto.subtle.decrypt(algorithm, importedKey, encryptedData);

    // Convert the decrypted data to a string
    const decryptedText = new TextDecoder().decode(decryptedData);

    return decryptedText;
}
