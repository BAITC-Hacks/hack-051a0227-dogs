import { test } from "node:test";
import assert from "node:assert/strict";
import {
  queueFilters,
  queueQuery,
  queueReturn,
} from "../src/lib/queue-location";

test("Возврат в очередь сохраняет поиск/фильтры и не допускает внешнюю навигацию", () => {
  const filters = queueFilters({
    search: "Новгородская & команда",
    stage: "REVIEW",
    program: "digital-products",
    check: "language",
    private: "ignored",
  });
  const location = queueReturn(queueQuery(filters));
  assert.deepEqual(
    queueFilters(
      Object.fromEntries(
        new URL(location, "https://local.invalid").searchParams,
      ),
    ),
    filters,
  );
  assert.equal(queueReturn("https://foreign.example/path"), "/admissions");
  assert.equal(queueReturn("redirect=//foreign.example"), "/admissions");
  assert.equal(queueFilters({ search: ["one", "two"] }).search, "");
  assert.equal(queueFilters({ search: "x".repeat(1000) }).search.length, 160);
});
