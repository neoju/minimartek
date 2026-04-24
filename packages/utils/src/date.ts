export const ISO_DATE_FORMAT = "YYYY-MM-DD";

export function formatDate(date: Date | string | number): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;

  const year = d.getUTCFullYear();

  const month = String(d.getUTCMonth() + 1).padStart(2, "0");

  const day = String(d.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function formatDateTime(date: Date | string | number): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;

  return d.toISOString();
}

export function parseIsoDate(value: string): Date {
  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO date: ${value}`);
  }

  return d;
}
