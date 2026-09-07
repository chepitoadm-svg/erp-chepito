// pdf-parse no trae tipos; se importa el archivo interno para evitar el bloque
// de debug del index.js. Declaración mínima de lo que usamos.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info?: unknown;
  }
  function pdf(dataBuffer: Buffer): Promise<PdfParseResult>;
  export default pdf;
}
