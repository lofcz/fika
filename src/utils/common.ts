/**
 * Pad the number of digits
 * @param digit number
 * @param len length
 */
export const fillDigit = (digit: number, len: number) => {
  return String(digit).padStart(len, '0');
};

/**
 * Check the device
 */
export const isPC = () => {
  return !navigator.userAgent.match(/(iPhone|iPod|iPad|Android|Mobile|BlackBerry|Symbian|Windows Phone)/i);
};

/**
 * True on macOS / iOS (Command key). False on Windows, Linux, etc.
 */
export const isMac = () => {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & {
    userAgentData?: {
      platform?: string;
    };
  }).userAgentData;
  if (uaData?.platform) return /mac/i.test(uaData.platform);
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
};

/**
 * Check the URL string
 */
export const isValidURL = (url: string) => {
  return /^(https?:\/\/)([\w-]+\.)+[\w-]{2,}(\/[\w-./?%&=]*)?$/i.test(url);
};

/**
 * Convert HTML to plain text.
 */
export const htmlToText = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
};

/**
 * Compare floating-point numbers.
 */
export const isFloatEqual = (a: number, b: number, epsilon = 1e-10) => {
  return Math.abs(a - b) < epsilon;
};

/**
 * Round a number to a fixed number of fraction digits.
 */
export const toFixed = (num: number, fractionDigits = 1) => {
  if (num % 1 !== 0) {
    return parseFloat(num.toFixed(fractionDigits));
  }
  return Math.floor(num);
};
