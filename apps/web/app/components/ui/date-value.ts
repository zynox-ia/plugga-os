/** Datas civis: os valores persistidos não dependem de UTC nem do fuso horário. */
export function parseDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return;
  return date;
}

export function dateValue(date: Date): string {
  return [String(date.getFullYear()).padStart(4, "0"), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function displayDate(value: string): string {
  return parseDate(value) ? value.split("-").reverse().join("/") : "";
}

export function parseDateInput(value: string): Date | undefined {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(value) ? parseDate(value.split("/").reverse().join("-")) : undefined;
}

export function maskDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
}

export function dateInputError(value: string, { min, max, required }: { min?: string; max?: string; required?: boolean }): string | undefined {
  if (!value) return required ? "Informe uma data." : undefined;
  const parsed = parseDateInput(value);
  if (!parsed) return "Informe uma data válida no formato dd/mm/aaaa.";
  const iso = dateValue(parsed);
  if (min && iso < min) return `Escolha uma data a partir de ${displayDate(min)}.`;
  if (max && iso > max) return `Escolha uma data até ${displayDate(max)}.`;
}
