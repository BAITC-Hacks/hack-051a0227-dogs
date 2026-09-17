export type QueueFilters = {
  search: string;
  program: string;
  stage: string;
  check: string;
};
export function queueFilters(
  query: Record<string, string | string[] | undefined>,
): QueueFilters {
  const value = (key: string) =>
    typeof query[key] === "string" ? query[key].slice(0, 160) : "";
  return {
    search: value("search"),
    program: value("program"),
    stage: value("stage"),
    check: value("check"),
  };
}
export function queueQuery(filters: QueueFilters) {
  return new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value),
  ).toString();
}
export function queueReturn(query: string | undefined) {
  const params = new URLSearchParams(query ?? "");
  const safe = queueQuery(queueFilters(Object.fromEntries(params)));
  return "/admissions" + (safe ? "?" + safe : "");
}
