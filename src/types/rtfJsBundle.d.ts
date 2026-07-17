declare module "rtf.js/dist/RTFJS.bundle.js" {
  export class Document {
    public constructor(blob: ArrayBuffer, settings: unknown);
    public render(): Promise<HTMLElement[]>;
  }
}
