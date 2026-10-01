-- The review queue needs the published rubric even on a clean installation.
-- Fictional local seed data must not be required for production operation.
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES (
  'rubric',
  jsonb_build_object(
    'version', 1,
    'guidance', 'Рассматривайте существенный вывод, личную роль и конкретный источник. «Есть проявление» — действие описано в одном эпизоде; «Устойчивое проявление» требует нескольких разных эпизодов. Достаточность источников и противоречия фиксируются отдельно. Рассказ кандидата не является независимым подтверждением. Чувствительные области оцениваются только человеком; травматические подробности не требуются. Формы ATOLA и D.R.I.V.E. здесь служат организации разговора, а не официальной психометрической шкале.'
  ),
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
