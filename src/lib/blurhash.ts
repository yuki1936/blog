// Keep this browser copy in sync with the TypeScript implementation in the blurhash project.
const BASE83 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";

export class BlurHashError extends Error {
  override readonly name = "BlurHashError";
}

export function encodeBase83(value: number, length: number): string {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !Number.isSafeInteger(length) ||
    length < 0
  ) {
    throw new BlurHashError("Base83 value and length must be non-negative integers");
  }
  if (value >= 83 ** length) {
    throw new BlurHashError("value does not fit in requested Base83 length");
  }

  let result = "";
  for (let index = 1; index <= length; index += 1) {
    const divisor = 83 ** (length - index);
    result += BASE83[Math.floor(value / divisor) % 83];
  }
  return result;
}

export function decodeBase83(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    const digit = BASE83.indexOf(character);
    if (digit < 0) {
      throw new BlurHashError(
        `invalid Base83 character ${JSON.stringify(character)} at index ${index}`,
      );
    }
    result = result * 83 + digit;
    if (!Number.isSafeInteger(result)) {
      throw new BlurHashError("Base83 value exceeds JavaScript's safe integer range");
    }
  }
  return result;
}

export function encode(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  componentsX: number,
  componentsY: number,
): string {
  validateDimensions(width, height);
  if (
    !Number.isInteger(componentsX) ||
    !Number.isInteger(componentsY) ||
    componentsX < 1 ||
    componentsX > 9 ||
    componentsY < 1 ||
    componentsY > 9
  ) {
    throw new BlurHashError("component counts must be integers in the range 1..=9");
  }

  const pixelCount = width * height;
  if (!Number.isSafeInteger(pixelCount) || pixelCount > 0x3fffffff) {
    throw new BlurHashError("pixel dimensions are too large");
  }
  const channels =
    pixels.length === pixelCount * 3 ? 3 : pixels.length === pixelCount * 4 ? 4 : 0;
  if (channels === 0) {
    throw new BlurHashError("pixel data length does not match the dimensions");
  }

  const factors: Color[] = [];
  for (let componentY = 0; componentY < componentsY; componentY += 1) {
    for (let componentX = 0; componentX < componentsX; componentX += 1) {
      const normalisation = componentX === 0 && componentY === 0 ? 1 : 2;
      const factor: Color = [0, 0, 0];
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const basis =
            normalisation *
            Math.cos((Math.PI * componentX * x) / width) *
            Math.cos((Math.PI * componentY * y) / height);
          const offset = channels * (x + y * width);
          factor[0] += basis * sRGBToLinear(pixels[offset]!);
          factor[1] += basis * sRGBToLinear(pixels[offset + 1]!);
          factor[2] += basis * sRGBToLinear(pixels[offset + 2]!);
        }
      }
      factors.push([
        factor[0] / pixelCount,
        factor[1] / pixelCount,
        factor[2] / pixelCount,
      ]);
    }
  }

  const maximum = factors
    .slice(1)
    .reduce(
      (current, factor) =>
        Math.max(current, Math.abs(factor[0]), Math.abs(factor[1]), Math.abs(factor[2])),
      0,
    );
  const quantisedMaximum =
    factors.length === 1 ? 0 : clamp(Math.floor(maximum * 166 - 0.5), 0, 82);
  const maximumValue = (quantisedMaximum + 1) / 166;

  let hash = encodeBase83(componentsX - 1 + (componentsY - 1) * 9, 1);
  hash += encodeBase83(quantisedMaximum, 1);
  hash += encodeBase83(encodeDC(factors[0]!), 4);
  for (const factor of factors.slice(1)) {
    hash += encodeBase83(encodeAC(factor, maximumValue), 2);
  }
  return hash;
}

export function decode(
  hash: string,
  width: number,
  height: number,
  punch = 1,
): Uint8ClampedArray {
  validateDimensions(width, height);
  if (!Number.isFinite(punch) || punch < 0) {
    throw new BlurHashError("punch must be finite and non-negative");
  }

  const pixelCount = width * height;
  if (!Number.isSafeInteger(pixelCount) || pixelCount > 0x3fffffff) {
    throw new BlurHashError("pixel dimensions are too large");
  }
  if (hash.length < 6) {
    throw new BlurHashError(`invalid hash length: expected at least 6, got ${hash.length}`);
  }

  const sizeFlag = decodeBase83(hash[0]!);
  const componentsX = (sizeFlag % 9) + 1;
  const componentsY = Math.floor(sizeFlag / 9) + 1;
  const expected = 4 + 2 * componentsX * componentsY;
  if (hash.length !== expected) {
    throw new BlurHashError(`invalid hash length: expected ${expected}, got ${hash.length}`);
  }

  const maximumValue = ((decodeBase83(hash[1]!) + 1) / 166) * punch;
  const colors: Color[] = [decodeDC(decodeBase83(hash.slice(2, 6)))];
  for (let index = 1; index < componentsX * componentsY; index += 1) {
    const start = 4 + index * 2;
    colors.push(decodeAC(decodeBase83(hash.slice(start, start + 2)), maximumValue));
  }

  const pixels = new Uint8ClampedArray(pixelCount * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color: Color = [0, 0, 0];
      for (let componentY = 0; componentY < componentsY; componentY += 1) {
        for (let componentX = 0; componentX < componentsX; componentX += 1) {
          const basis =
            Math.cos((Math.PI * x * componentX) / width) *
            Math.cos((Math.PI * y * componentY) / height);
          const factor = colors[componentX + componentY * componentsX]!;
          color[0] += factor[0] * basis;
          color[1] += factor[1] * basis;
          color[2] += factor[2] * basis;
        }
      }
      const offset = 4 * (x + y * width);
      pixels[offset] = linearToSRGB(color[0]);
      pixels[offset + 1] = linearToSRGB(color[1]);
      pixels[offset + 2] = linearToSRGB(color[2]);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

type Color = [number, number, number];

function validateDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new BlurHashError("width and height must be positive safe integers");
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function sRGBToLinear(value: number): number {
  const converted = value / 255;
  return converted <= 0.04045
    ? converted / 12.92
    : ((converted + 0.055) / 1.055) ** 2.4;
}

function linearToSRGB(value: number): number {
  const converted = clamp(value, 0, 1);
  return Math.floor(
    (converted <= 0.0031308
      ? converted * 12.92
      : 1.055 * converted ** (1 / 2.4) - 0.055) *
      255 +
      0.5,
  );
}

function signPow(value: number, exponent: number): number {
  return Math.sign(value) * Math.abs(value) ** exponent;
}

function encodeDC(value: Color): number {
  return (
    (linearToSRGB(value[0]) << 16) +
    (linearToSRGB(value[1]) << 8) +
    linearToSRGB(value[2])
  );
}

function decodeDC(value: number): Color {
  return [
    sRGBToLinear(value >> 16),
    sRGBToLinear((value >> 8) & 255),
    sRGBToLinear(value & 255),
  ];
}

function encodeAC(value: Color, maximumValue: number): number {
  const quantise = (component: number): number =>
    clamp(Math.floor(signPow(component / maximumValue, 0.5) * 9 + 9.5), 0, 18);
  return quantise(value[0]) * 19 * 19 + quantise(value[1]) * 19 + quantise(value[2]);
}

function decodeAC(value: number, maximumValue: number): Color {
  const decodeComponent = (quantised: number): number =>
    signPow((quantised - 9) / 9, 2) * maximumValue;
  return [
    decodeComponent(Math.floor(value / (19 * 19))),
    decodeComponent(Math.floor(value / 19) % 19),
    decodeComponent(value % 19),
  ];
}
