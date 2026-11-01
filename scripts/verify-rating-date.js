function buildDateOptionsFromMatches(matches) {
  const isoToday = '2026-09-12';
  if (!matches || matches.length === 0) return [isoToday];
  const dates = Array.from(new Set((matches || []).map(m => m && m.date).filter(Boolean)))
    .filter(date => date <= isoToday)
    .sort();
  if (dates.length === 0) return [isoToday];
  const first = dates[0];
  let last = dates[dates.length - 1];
  if (last < isoToday) last = isoToday;
  const [y1, m1, d1] = first.split('-').map(Number);
  const [y2, m2, d2] = last.split('-').map(Number);
  let cur = Date.UTC(y1, m1 - 1, d1);
  const end = Date.UTC(y2, m2 - 1, d2);
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const temp = [];
  while (cur <= end) {
    const dt = new Date(cur);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    temp.push(`${yyyy}-${mm}-${dd}`);
    cur += ONE_DAY;
  }
  return temp.reverse();
}
const opts = buildDateOptionsFromMatches([{ date: '2026-09-10' }]);
console.log('first=' + opts[0]);
console.log('includesToday=' + opts.includes('2026-09-12'));
console.log('recentDates=' + JSON.stringify(opts.slice(0, 4)));
