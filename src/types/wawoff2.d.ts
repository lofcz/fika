declare module 'wawoff2' {
  function compress(buffer: Uint8Array): Promise<Uint8Array>;
  function decompress(buffer: Uint8Array): Promise<Uint8Array>;
}
