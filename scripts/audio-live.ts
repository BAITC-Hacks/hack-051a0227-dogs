// Paid probes now require the owner's authenticated browser action and shared budget.
console.error(
  "Откройте /settings/openai в локальном приложении: отдельные проверки текста, расшифровки и озвучивания запускаются владельцем с подтверждением расходов.",
);
process.exitCode = 1;
