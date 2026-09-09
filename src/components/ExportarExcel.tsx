"use client";

import XLSX from "xlsx-js-style";

export type EstiloFila = "seccion" | "dato" | "subtotal" | "total";
export interface ColExcel {
  titulo: string;
  ancho?: number; // en caracteres
  money?: boolean; // formato de moneda + alineado a la derecha
}
export interface FilaExcel {
  celdas: (string | number | null)[];
  estilo?: EstiloFila; // "dato" por defecto
}

const MONEY_FMT = "#,##0.00;(#,##0.00)"; // negativos entre paréntesis
const GRIS_HEADER = "374151";
const GRIS_SECCION = "EEF0F3";
const GRIS_TOTAL = "DCE0E6";
const BORDE = { style: "thin", color: { rgb: "C7CCD1" } } as const;

// Botón que baja un .xlsx bien formateado (título, encabezados, secciones,
// subtotales/totales y montos con separador de miles). Cliente, con xlsx-js-style.
export default function ExportarExcel({
  nombre,
  hoja = "Reporte",
  titulo,
  subtitulo,
  columnas,
  filas,
  className,
}: {
  nombre: string;
  hoja?: string;
  titulo: string;
  subtitulo?: string;
  columnas: ColExcel[];
  filas: FilaExcel[];
  className?: string;
}) {
  const exportar = () => {
    const nc = columnas.length;
    const aoa: (string | number | null)[][] = [];
    // Encabezado del documento.
    aoa.push([titulo, ...Array(nc - 1).fill(null)]);
    if (subtitulo) aoa.push([subtitulo, ...Array(nc - 1).fill(null)]);
    aoa.push(Array(nc).fill(null)); // fila en blanco
    const filaEncabezados = aoa.length;
    aoa.push(columnas.map((c) => c.titulo));
    const primerDato = aoa.length;
    for (const f of filas) {
      const row = columnas.map((_, i) => (f.celdas[i] ?? null));
      aoa.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = columnas.map((c) => ({ wch: c.ancho ?? (c.money ? 16 : 24) }));
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: nc - 1 } },
      ...(subtitulo ? [{ s: { r: 1, c: 0 }, e: { r: 1, c: nc - 1 } }] : []),
    ];

    const range = XLSX.utils.decode_range(ws["!ref"]!);
    for (let r = range.s.r; r <= range.e.r; r++) {
      const filaDef = r >= primerDato ? filas[r - primerDato] : null;
      const estilo: EstiloFila | "titulo" | "subtitulo" | "encabezado" =
        r === 0 ? "titulo" : subtitulo && r === 1 ? "subtitulo" : r === filaEncabezados ? "encabezado" : filaDef?.estilo ?? "dato";
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) continue;
        const money = columnas[c]?.money && typeof cell.v === "number";
        const s: Record<string, unknown> = { alignment: { horizontal: money ? "right" : "left", vertical: "center" } };
        if (money) cell.z = MONEY_FMT;

        if (estilo === "titulo") s.font = { bold: true, sz: 14 };
        else if (estilo === "subtitulo") s.font = { italic: true, sz: 10, color: { rgb: "6B7280" } };
        else if (estilo === "encabezado") {
          s.font = { bold: true, color: { rgb: "FFFFFF" } };
          s.fill = { fgColor: { rgb: GRIS_HEADER } };
          s.alignment = { horizontal: columnas[c]?.money ? "right" : "left", vertical: "center" };
        } else if (estilo === "seccion") {
          s.font = { bold: true };
          s.fill = { fgColor: { rgb: GRIS_SECCION } };
        } else if (estilo === "subtotal") {
          s.font = { bold: true };
          s.border = { top: BORDE };
        } else if (estilo === "total") {
          s.font = { bold: true };
          s.fill = { fgColor: { rgb: GRIS_TOTAL } };
          s.border = { top: { style: "medium", color: { rgb: "9AA1A9" } } };
        }
        cell.s = s;
      }
    }
    ws["!rows"] = aoa.map((_, r) => ({ hpt: r === 0 ? 20 : 15 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, hoja);
    XLSX.writeFile(wb, nombre);
  };

  return (
    <button
      type="button"
      onClick={exportar}
      className={
        className ??
        "rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      }
    >
      Exportar a Excel
    </button>
  );
}
