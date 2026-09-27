import "server-only";
import { runDeskQueueOnce } from "./vision-desk.server";
import { runCalendarQueueOnce } from "./selection-actions.server";
const state = globalThis as typeof globalThis & {
  intakeWorker?: ReturnType<typeof setInterval>;
  intakeBusy?: boolean;
};
export function startIntakeWorker() {
  if (state.intakeWorker || process.env.INTAKE_WORKER_DISABLED === "true")
    return;
  state.intakeWorker = setInterval(async () => {
    if (state.intakeBusy) return;
    state.intakeBusy = true;
    try {
      await runDeskQueueOnce();
      await runCalendarQueueOnce();
    } catch {
      /* Pending database events remain available after recovery; no request content is logged. */
    } finally {
      state.intakeBusy = false;
    }
  }, 5000);
  state.intakeWorker.unref();
}
