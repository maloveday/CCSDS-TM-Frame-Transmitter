/**
 * Reed-Solomon encoder for CCSDS TM Synchronization and Channel Coding.
 * Reference: CCSDS 131.0-B-5, Section 4 (RS Coding)
 *
 * GF(2^8) field:
 *   Primitive polynomial: x^8 + x^7 + x^2 + x + 1  (0x187)
 *   Primitive element:    α = 0x02  (root of the polynomial)
 *
 * Supported codes:
 *   RS(255,223): k=223 data bytes, 32 check bytes, E=16 (corrects up to 16 errors)
 *   RS(255,239): k=239 data bytes, 16 check bytes, E=8  (corrects up to 8 errors)
 *
 * Generator polynomial: g(x) = Π_{j=0}^{2t-1} (x + α^(FCR+j)), FCR=112
 *
 * Interleaving (CCSDS 131.0-B-5 §4.4):
 *   Depth I: I independent RS codewords encoded from I sub-blocks of k bytes.
 *   Interleaved output: byte-wise interleave of the I codewords.
 *   Output size = n * I bytes.
 */

export type RsVariant = 'RS_255_223' | 'RS_255_239';
export type RsInterleaveDepth = 1 | 2 | 3 | 4 | 5 | 8;

export interface RsVariantInfo {
  n: number;    // codeword length (255)
  k: number;    // data length
  twoT: number; // number of check symbols (n - k)
  fcr: number;  // first consecutive root (112)
  label: string;
}

export const RS_VARIANT_INFO: Record<RsVariant, RsVariantInfo> = {
  RS_255_223: { n: 255, k: 223, twoT: 32, fcr: 112, label: 'RS(255,223) E=16' },
  RS_255_239: { n: 255, k: 239, twoT: 16, fcr: 112, label: 'RS(255,239) E=8' },
};

// ---------------------------------------------------------------------------
// GF(2^8) tables
// ---------------------------------------------------------------------------

const PRIM_POLY = 0x187; // x^8 + x^7 + x^2 + x + 1

export const GF_EXP = new Uint8Array(512); // gfExp[i] = α^i; extended to 512 for convenience
export const GF_LOG = new Uint8Array(256); // gfLog[v] = log_α(v); gfLog[0] is unused

{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= PRIM_POLY;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
}

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

// ---------------------------------------------------------------------------
// Generator polynomial cache
// ---------------------------------------------------------------------------

const GEN_POLY_CACHE = new Map<string, Uint8Array>();

/**
 * Build the RS generator polynomial.
 * g(x) = Π_{j=0}^{2t-1} (x + α^(fcr+j))
 * Returns array of 2t+1 coefficients where result[i] = coeff of x^i, result[2t] = 1.
 */
export function buildGenPoly(twoT: number, fcr: number): Uint8Array {
  const key = `${twoT}:${fcr}`;
  const cached = GEN_POLY_CACHE.get(key);
  if (cached) return cached;

  let g: number[] = [1]; // start: g(x) = 1
  for (let j = 0; j < twoT; j++) {
    const root = GF_EXP[(fcr + j) % 255]; // α^(fcr+j)
    // Multiply g(x) by (x + root)
    const newG = new Array(g.length + 1).fill(0);
    for (let i = 0; i < g.length; i++) {
      newG[i] ^= gfMul(g[i], root); // g[i]*root → x^i term
      newG[i + 1] ^= g[i];           // g[i] → x^(i+1) term
    }
    g = newG;
  }

  const result = new Uint8Array(g);
  GEN_POLY_CACHE.set(key, result);
  return result;
}

// ---------------------------------------------------------------------------
// RS block encoder
// ---------------------------------------------------------------------------

/**
 * RS-encode a single k-byte data block using LFSR division.
 * Returns n = k + 2t bytes (data bytes followed by check bytes, high-degree first).
 */
export function rsEncodeBlock(data: Uint8Array, variant: RsVariant): Uint8Array {
  const { k, n, twoT, fcr } = RS_VARIANT_INFO[variant];
  if (data.length !== k) {
    throw new RangeError(`rsEncodeBlock: expected ${k} data bytes, got ${data.length}`);
  }

  // gen[0..twoT] where gen[2t]=1; we only use gen[0..twoT-1] for the LFSR feedback
  const gen = buildGenPoly(twoT, fcr);

  // LFSR shift register: rem[j] holds coefficient of x^j in the partial remainder
  const rem = new Uint8Array(twoT);

  for (let i = 0; i < k; i++) {
    // feedback = current data byte XOR high-order remainder coefficient
    const feedback = data[i] ^ rem[twoT - 1];
    // Shift register right (higher degree to lower), adding feedback × generator coefficients
    for (let j = twoT - 1; j > 0; j--) {
      rem[j] = rem[j - 1] ^ gfMul(gen[j], feedback);
    }
    rem[0] = gfMul(gen[0], feedback);
  }

  // Codeword = [data bytes][check bytes from degree 2t-1 down to 0 (big-endian)]
  const codeword = new Uint8Array(n);
  codeword.set(data);
  for (let i = 0; i < twoT; i++) {
    codeword[k + i] = rem[twoT - 1 - i];
  }
  return codeword;
}

// ---------------------------------------------------------------------------
// Interleaved RS encoder
// ---------------------------------------------------------------------------

/**
 * RS-encode with optional interleaving.
 *
 * The input data is padded with 0x00 or truncated to k*depth bytes, then split
 * into `depth` blocks of k bytes. Each block is RS-encoded to n=255 bytes.
 * The resulting depth codewords are byte-interleaved per CCSDS 131.0-B-5 §4.4:
 *
 *   output[j*depth + i] = codeword_i[j]   for j=0..n-1, i=0..depth-1
 *
 * Output length = n * depth bytes.
 */
export function rsEncode(
  data: Uint8Array,
  variant: RsVariant,
  interleaveDepth: RsInterleaveDepth = 1,
): Uint8Array {
  const { k, n } = RS_VARIANT_INFO[variant];
  const I = interleaveDepth;
  const totalDataBytes = k * I;

  // Pad or truncate to k*I bytes
  const paddedData = new Uint8Array(totalDataBytes);
  paddedData.set(data.subarray(0, Math.min(data.length, totalDataBytes)));

  // Encode each sub-block independently
  const codewords: Uint8Array[] = [];
  for (let i = 0; i < I; i++) {
    const block = paddedData.subarray(i * k, (i + 1) * k);
    codewords.push(rsEncodeBlock(block, variant));
  }

  if (I === 1) return codewords[0];

  // Byte-interleave: output[j*I + i] = codewords[i][j]
  const output = new Uint8Array(n * I);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < I; i++) {
      output[j * I + i] = codewords[i][j];
    }
  }
  return output;
}

// ---------------------------------------------------------------------------
// Syndrome evaluation (used for validation / testing)
// ---------------------------------------------------------------------------

/**
 * Evaluate a polynomial at a GF(2^8) point using Horner's method.
 * `poly` is in big-endian byte order (poly[0] = coefficient of highest degree).
 */
export function gfEvalPoly(poly: Uint8Array, x: number): number {
  let acc = 0;
  for (let i = 0; i < poly.length; i++) {
    acc = gfMul(acc, x) ^ poly[i];
  }
  return acc;
}

/**
 * Check that a codeword is valid by evaluating the syndrome at the 2t roots.
 * Returns true iff the codeword is a valid RS codeword (syndrome = 0 for all roots).
 */
export function rsIsValidCodeword(codeword: Uint8Array, variant: RsVariant): boolean {
  const { n, twoT, fcr } = RS_VARIANT_INFO[variant];
  if (codeword.length !== n) return false;
  for (let j = 0; j < twoT; j++) {
    if (gfEvalPoly(codeword, GF_EXP[(fcr + j) % 255]) !== 0) return false;
  }
  return true;
}
