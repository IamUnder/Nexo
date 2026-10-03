import { describe, expect, it } from "vitest";
import { buildCsv, decodeCsv, detectDelimiter, parseCsv, readCsv } from "./csv";

describe("lectura de CSV", () => {
  it("detecta ; (Excel español), coma y tabulador", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter('"a,b";c;d')).toBe(";"); // la coma está entre comillas
  });

  it("analiza comillas, comillas escapadas, saltos dentro de un campo y CRLF", () => {
    const text = 'nombre;nota\r\n"Pérez; Ana";"dijo ""hola"""\r\nLuis;"línea 1\nlínea 2"\r\n';
    expect(parseCsv(text)).toEqual([
      ["nombre", "nota"],
      ["Pérez; Ana", 'dijo "hola"'],
      ["Luis", "línea 1\nlínea 2"],
    ]);
  });

  it("no pierde la última fila sin salto final ni los campos vacíos", () => {
    expect(parseCsv("a;b;c\n1;;3")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("toTable: cabeceras únicas, filas vacías descartadas y celdas recortadas", () => {
    const t = readCsv("Nombre; Nombre ;;Email\n Ana ;x;y;a@b.es\n;;;\n");
    expect(t.headers).toEqual(["Nombre", "Nombre (2)", "Columna 3", "Email"]);
    expect(t.rows).toEqual([
      { Nombre: "Ana", "Nombre (2)": "x", "Columna 3": "y", Email: "a@b.es" },
    ]);
  });

  it("decodifica UTF-8 con BOM y cae a Windows-1252 si no es UTF-8 válido", () => {
    const utf8 = new TextEncoder().encode("﻿Empresa;Ñandú");
    expect(decodeCsv(utf8.buffer)).toBe("Empresa;Ñandú");
    // «Ñandú» en Windows-1252: Ñ = 0xD1, ú = 0xFA (bytes inválidos como UTF-8).
    const latin = new Uint8Array([0xd1, 0x61, 0x6e, 0x64, 0xfa]);
    expect(decodeCsv(latin.buffer)).toBe("Ñandú");
  });

  it("buildCsv escapa y antepone BOM", () => {
    expect(buildCsv(["a", "b"], [["x;y", 'q"r']])).toBe('﻿a;b\r\n"x;y";"q""r"\r\n');
  });
});
