export function toDateTimeLocalInputValue(value: string, timezoneOffsetMinutes?: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = timezoneOffsetMinutes ?? date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
