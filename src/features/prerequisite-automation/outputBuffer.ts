/**
 * Fixed-capacity ring buffer for captured process output.
 *
 * A runaway script can emit unbounded output. Without a cap the extension host
 * would accumulate it all in memory. Older bytes are dropped so the tail — which
 * carries the error — always survives.
 */
export class OutputBuffer {
  private _chunks: string[] = [];
  private _byteLength = 0;
  private _truncated = false;

  public constructor(private readonly _maxBytes: number) {}

  public append(chunk: string): void {
    if (chunk.length === 0) {
      return;
    }

    this._chunks.push(chunk);
    this._byteLength += Buffer.byteLength(chunk, "utf8");

    while (this._byteLength > this._maxBytes && this._chunks.length > 1) {
      const dropped = this._chunks.shift();
      this._byteLength -= Buffer.byteLength(dropped ?? "", "utf8");
      this._truncated = true;
    }

    if (this._byteLength > this._maxBytes && this._chunks.length === 1) {
      // Trim in bytes, not characters: the cap is a byte budget, and slicing by
      // string length would let a multi-byte payload sit well over it.
      const bytes = Buffer.from(this._chunks[0], "utf8");
      let start = bytes.length - this._maxBytes;
      // Never cut a multi-byte character in half: skip forward past any UTF-8
      // continuation bytes (10xxxxxx) so the slice starts on a lead byte.
      while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) {
        start++;
      }
      this._chunks[0] = bytes.subarray(start).toString("utf8");
      this._byteLength = Buffer.byteLength(this._chunks[0], "utf8");
      this._truncated = true;
    }
  }

  public get truncated(): boolean {
    return this._truncated;
  }

  public toString(): string {
    return this._chunks.join("");
  }
}
