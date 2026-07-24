// Minimal Node API shims for the browser port of server.mjs.
//
// Only the surface actually used by server-core.js is implemented:
//   Buffer.from(str, 'utf8'|'base64'|'base64url') / Buffer.from(bytes)
//   buf.toString('utf8'|'base64'|'base64url'|'hex')
//   Buffer.byteLength(str), Buffer.concat(list)
//   createHash('sha256').update(text).digest('hex')   (synchronous)
//   randomUUID()

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class Buffer extends Uint8Array {
  static from(value, encoding) {
    if (typeof value === 'string') {
      if (encoding === 'base64' || encoding === 'base64url') {
        const normalized = encoding === 'base64url'
          ? value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
          : value;
        const binary = atob(normalized);
        const bytes = new Buffer(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
      }
      if (encoding === 'hex') {
        const bytes = new Buffer(value.length / 2);
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = parseInt(value.slice(index * 2, index * 2 + 2), 16);
        }
        return bytes;
      }
      // utf8 (default)
      const encoded = textEncoder.encode(value);
      return new Buffer(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    }
    if (value instanceof ArrayBuffer) {
      return new Buffer(new Uint8Array(value));
    }
    if (ArrayBuffer.isView(value)) {
      return new Buffer(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    }
    return new Buffer(Uint8Array.from(value || []));
  }

  static byteLength(value, encoding = 'utf8') {
    if (typeof value !== 'string') {
      return value?.byteLength ?? 0;
    }
    if (encoding === 'utf8' || encoding === 'utf-8') {
      return textEncoder.encode(value).length;
    }
    return Buffer.from(value, encoding).length;
  }

  static concat(list) {
    const total = list.reduce((sum, item) => sum + item.length, 0);
    const result = new Buffer(total);
    let offset = 0;
    for (const item of list) {
      result.set(item, offset);
      offset += item.length;
    }
    return result;
  }

  toString(encoding = 'utf8') {
    if (encoding === 'base64' || encoding === 'base64url') {
      let binary = '';
      const chunkSize = 0x8000;
      for (let index = 0; index < this.length; index += chunkSize) {
        binary += String.fromCharCode(...this.subarray(index, index + chunkSize));
      }
      const base64 = btoa(binary);
      return encoding === 'base64url'
        ? base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
        : base64;
    }
    if (encoding === 'hex') {
      return [...this].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    return textDecoder.decode(this);
  }
}

// Synchronous SHA-256 (WebCrypto digest is async; server code hashes inline).
function sha256Bytes(bytes) {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const bitLength = bytes.length * 8;
  const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));

  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i += 1) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  for (let i = 0; i < 8; i += 1) {
    digestView.setUint32(i * 4, H[i]);
  }
  return digest;
}

export function createHash(algorithm) {
  if (algorithm !== 'sha256') {
    throw new Error(`Unsupported hash algorithm: ${algorithm}`);
  }
  const chunks = [];
  return {
    update(value) {
      chunks.push(typeof value === 'string' ? textEncoder.encode(value) : new Uint8Array(value));
      return this;
    },
    digest(encoding = 'hex') {
      const bytes = sha256Bytes(Buffer.concat(chunks));
      return encoding === 'hex' ? Buffer.from(bytes).toString('hex') : Buffer.from(bytes);
    },
  };
}

export function randomUUID() {
  return crypto.randomUUID();
}
