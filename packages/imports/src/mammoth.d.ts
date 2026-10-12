declare module 'mammoth' {
  export function extractRawText(input: {
    arrayBuffer?: ArrayBuffer;
    buffer?: Uint8Array;
  }): Promise<{ value: string }>;
}
