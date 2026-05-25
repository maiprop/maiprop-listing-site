export function formatLocalDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createLocalDateTimeIso(date: string, time: string) {
  const value = new Date(`${date}T${time}:00`);
  if (Number.isNaN(value.getTime())) {
    throw new Error("Invalid local date/time");
  }
  return value.toISOString();
}
