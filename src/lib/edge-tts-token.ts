/**
 * Sec-MS-GEC v2 token for Microsoft's Edge "read aloud" text-to-speech service.
 *
 * Derived from `edge_tts/drm.py` in rany2/edge-tts 7.3.x (LGPL-3.0, https://github.com/rany2/edge-tts),
 * translated to TypeScript. This module is a derivative work and is therefore offered under the
 * LGPL-3.0 as well. It is only used on the server.
 *
 * Input: the string "<windows file time ticks><trusted client token>". Output: "<16 hex>-<64 hex>"
 * (a custom 64-bit checksum, then a SHA-256 variant over the same bytes).
 */

const SHA256_INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const SHA256_STATE = [0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a, 0x6c006f49, 0x04bd35ab, 0xfeb0a7e4, 0x03effbd2];
const SHA256_SCHEDULE = [0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba, 0xa622ee8c, 0xd1dd9491, 0xc0dd25a0, 0xf9e70ab6, 0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33, 0xd258b060, 0x72766564];
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const ADJUSTMENT = 0xc9dc06a7;
const BLOCK_K = K.map((v, i) => (i === 14 ? ADJUSTMENT : v));
const SIGMA0_ADJUSTMENT = 0x059c0b80;
const SIGMA1_ADJUSTMENT = 0x000b92c0;

const CS64_COEFFICIENTS: Array<[number, number]> = [
  [0xe82e91b1, 0xb32700d0], [0x44de24c6, 0x88dff51d], [0x3beb65bc, 0x29514038], [0xc89c5933, 0xb328cbdf], [0x8d1ec211, 0xd405b4d5], [0x314ef5d5, 0x26e55f3c], [0xe92491b1, 0x607801c6],
  [0xf0a5b9d5, 0x82b2c1fb], [0x06064cf3, 0xfa51a3da], [0xda79fa60, 0x207cc464], [0xbed20560, 0x3c3c74f3], [0x89f9c9f8, 0xd2d14b61], [0x35fa38c6, 0xbb04a2c1], [0xcb49e3c6, 0xc5626167],
];
const CS64_FACTOR = 0x82893933;
const CS64_ADJUSTMENT0 = 0xf2f90b1a;
const CS64_ADJUSTMENT1 = 0x0b1a0000;

const u = (n: number) => n >>> 0;
const mul = (a: number, b: number) => Math.imul(a, b) >>> 0;
const rol16 = (v: number) => u((v << 16) | (v >>> 16));
const rotr = (v: number, n: number) => (v >>> n) | (v << (32 - n));
const sigma0 = (v: number) => u((v >>> 7) ^ (v << 25) ^ (v >>> 18) ^ (v << 14) ^ (v >>> 3));
const sigma1 = (v: number) => u((v >>> 17) ^ (v << 15) ^ (v >>> 19) ^ (v << 13) ^ (v >>> 10));

/** Extends `words` (already holding `first` entries) to the 64-entry SHA-256 message schedule. */
const expand = (words: number[], first = 16) => {
  for (let i = first; i < 64; i++) words.push(u(sigma1(words[i - 2]) + words[i - 7] + sigma0(words[i - 15]) + words[i - 16]));
};

const rounds = (state: number[], words: number[], first = 0) => {
  let [a, b, c, d, e, f, g, h] = state;
  const k = first === 14 ? BLOCK_K : K;
  for (let i = first; i < 64; i++) {
    const t1 = u(h + u(rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + u(g ^ (e & (f ^ g))) + k[i] + words[i]);
    const t2 = u(u(rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + u((a & b) | (c & (a | b))));
    h = g;
    g = f;
    f = e;
    e = u(d + t1);
    d = c;
    c = b;
    b = a;
    a = u(t1 + t2);
  }
  return [a, b, c, d, e, f, g, h];
};

const be32 = (data: Uint8Array, at: number) => u((data[at] << 24) | (data[at + 1] << 16) | (data[at + 2] << 8) | data[at + 3]);

const sha256Init = (head: Uint8Array) => {
  const words = [...new Array<number>(14).fill(0), (head[0] << 16) | (head[1] << 8) | head[2], be32(head, 3)];
  for (let i = 16; i < 30; i++) {
    let value = SHA256_SCHEDULE[i - 16];
    if (i - 2 >= 14) value += i === 16 ? sigma1(words[i - 2]) ^ SIGMA1_ADJUSTMENT : sigma1(words[i - 2]);
    if (i - 7 >= 14) value += words[i - 7];
    if (i - 15 >= 14) value += i === 29 ? sigma0(words[i - 15]) ^ SIGMA0_ADJUSTMENT : sigma0(words[i - 15]);
    words.push(u(value));
  }
  words.push(u(sigma1(words[28]) + words[23] + sigma0(words[15]) + words[14] + ADJUSTMENT - K[14]));
  expand(words, 31);
  const working = rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((x, i) => u(x + working[i]));
};

const sha256Digest = (data: Uint8Array) => {
  const length = 57 + data.length;
  const pad = (((55 - length) % 64) + 64) % 64;
  const padded = new Uint8Array(data.length - 7 + 1 + pad + 8);
  padded.set(data.subarray(7));
  padded[data.length - 7] = 0x80;
  new DataView(padded.buffer).setBigUint64(padded.length - 8, BigInt(length) * BigInt(8));
  let state = sha256Init(data.subarray(0, 7));
  for (let off = 0; off < padded.length; off += 64) {
    const words: number[] = [];
    for (let i = 0; i < 16; i++) words.push(be32(padded, off + i * 4));
    expand(words);
    const working = rounds(state, words);
    state = state.map((x, i) => u(x + working[i]));
  }
  const out = new Uint8Array(32);
  const view = new DataView(out.buffer);
  state.forEach((v, i) => view.setUint32(i * 4, v));
  return out;
};

const cs64Digest = (data: Uint8Array, digest: Uint8Array): [number, number] => {
  const dv = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const keyA = u(dv.getUint32(0, true) | 1);
  const keyB = u(dv.getUint32(4, true) | 1);
  const keys = [keyA, keyB];
  const factors = [mul(keyA, CS64_FACTOR), mul(keyB, CS64_FACTOR)];
  const terms = CS64_COEFFICIENTS.map(([coefficient], i) => mul(coefficient, factors[i % 2]));
  const offsets = CS64_COEFFICIENTS.map(([, offset]) => offset);

  // b"\x00" + data, zero-padded to a whole number of little-endian 32-bit words, even count.
  const raw = new Uint8Array(1 + data.length);
  raw.set(data, 1);
  const wordCount = Math.ceil(raw.length / 4);
  const padded = new Uint8Array((wordCount + (wordCount % 2)) * 4);
  padded.set(raw);
  const pv = new DataView(padded.buffer);
  for (let i = 0; i < padded.length / 4; i++) {
    const word = pv.getUint32(i * 4, true);
    let term = mul(word, keys[i % 2]);
    let offset = mul(rol16(word), i % 2 === 0 ? 0xef0569fb : 0xc31713db);
    if (i === 0) {
      term = u(term + mul(CS64_ADJUSTMENT0, factors[0]));
      offset = u(offset + CS64_ADJUSTMENT1);
    }
    terms.push(term);
    offsets.push(offset);
  }

  let swapAcc = 0;
  let swapLast = 0;
  let state = 0;
  let acc = 0;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i];
    const y = terms[i + 1];
    let t = rol16(u(offsets[i] + x));
    let q = mul(t, 0x76f50f34);
    swapAcc = u(swapAcc + u(mul(rol16(q), 0xc3efea97) + q));
    t = rol16(u(offsets[i + 1] + y));
    q = mul(t, 0x1881ce3c);
    swapLast = u(mul(rol16(q), 0x35bd1ec9) + q);
    swapAcc = u(swapAcc + swapLast);

    state = u(mul(state, keyA) + x);
    state = mul(rol16(state), 0xcf98b111);
    state = mul(rol16(state), 0x87085b9f);
    state = mul(rol16(state), 0x12ceb96d);
    state = mul(rol16(state), 0x257e1d83);
    acc = u(acc + state);
    t = u(mul(state, keyB) + y);
    t = mul(rol16(t), 0xa27416f5);
    t = mul(rol16(t), 0xd38396ff);
    state = mul(rol16(mul(rol16(t), 0x7c932b89)), 0xbfa49f69);
    acc = u(acc + state);
  }
  return [u(swapLast ^ state), u(swapAcc ^ acc)];
};

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();

/** `"<windows ticks><trusted client token>"` → the Sec-MS-GEC value. */
export const secMsGecV2 = (input: string): string => {
  const data = new TextEncoder().encode(input);
  if (data.length < 7) throw new Error("Token salt must contain at least seven bytes");
  const digest = sha256Digest(data);
  const [a, b] = cs64Digest(data, digest);
  const cs = new Uint8Array(8);
  const view = new DataView(cs.buffer);
  view.setUint32(0, a, true);
  view.setUint32(4, b, true);
  return `${hex(cs)}-${hex(digest)}`;
};
