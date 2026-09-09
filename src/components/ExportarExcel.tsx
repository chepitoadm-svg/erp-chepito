"use client";

import * as XLSX from "xlsx";

type Celda = string | number | null;

// Botón que arma un .xlsx en el cliente a partir de una matriz (filas × columnas)
// y lo descarga. Reutilizable por cualquier reporte.
export default function ExportarExcel({
  nombre,
  hoja = "Reporte",
  filas,
  className,
}: {
  nombre: string; // nombre del archivo, ej. "balance-2026-07-31.xlsx"
  hoja?: string;
  filas: Celda[][];
  className?: string;
}) {
  const exportar = () => {
    const ws = XLSX.utils.aoa_to_sheet(filas);
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
