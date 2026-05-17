import { call } from "./invoke";

export type ForwardHit = {
  page: number;
  x: number;
  y: number;
  h: number;
  v: number;
  width: number;
  height: number;
};

export type InverseHit = {
  file: string;
  line: number;
  column: number;
};

export const synctexApi = {
  forward: (sourceFile: string, line: number, column: number, pdfPath: string) =>
    call<ForwardHit | null>("synctex_forward", { sourceFile, line, column, pdfPath }),
  inverse: (pdfPath: string, page: number, x: number, y: number) =>
    call<InverseHit | null>("synctex_inverse", { pdfPath, page, x, y }),
};
