// Dates in the shop's local time (Pakistan), never UTC.
// toISOString() is UTC, which puts sales made between midnight and 5 AM on the previous day.

// YYYY-MM-DD for a Date (or anything new Date() accepts), in local time
export const localDate = (d = new Date()) => new Date(d).toLocaleDateString("en-CA");

// True when the timestamp falls on today's local date
export const isToday = (d) => !!d && localDate(d) === localDate();

// True when the timestamp's local date is between from and to (YYYY-MM-DD, inclusive)
export const isBetween = (d, from, to) => {
  if (!d) return false;
  const day = localDate(d);
  return (!from || day >= from) && (!to || day <= to);
};
