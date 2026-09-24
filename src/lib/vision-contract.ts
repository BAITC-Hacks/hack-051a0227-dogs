import { z } from "zod";
import { profileScopeSchema } from "./profile-contract";
export const visionVersion = "vision-learning-v1";
export const visionConsentSchema = z.object({
  granted: z.boolean(),
  revision: z.number().int(),
  at: z.string(),
});
export const visionOperations = [
  "read_work",
  "compare_versions",
  "get_program",
  "find_resource",
  "suggest_development",
  "open_task",
  "prepare_plan",
] as const;
export const visionToolArgs = z
  .object({
    operation: z.enum(visionOperations),
    key: z.string().min(1).max(160),
  })
  .strict();
export const visionTool = {
  type: "function",
  name: "vision_action",
  description:
    "Read a permitted source, compare the selected work, find an approved resource, or propose a personal next step. Plan proposals never save without the user's confirmation.",
  strict: true,
  parameters: z.toJSONSchema(visionToolArgs),
};
export const visionOutputSchema = z
  .object({
    text: z.string().min(1).max(600),
    claims: z
      .array(
        z
          .object({
            text: z.string().min(1).max(1400),
            refs: z
              .array(
                z
                  .object({
                    key: z.string(),
                    quote: z.string().min(1).max(800),
                  })
                  .strict(),
              )
              .min(1)
              .max(3),
          })
          .strict(),
      )
      .max(5),
    actionKeys: z.array(z.string()).max(3),
    proposalKey: z.string().nullable(),
  })
  .strict();
export const visionRequestSchema = z
  .object({
    scope: profileScopeSchema.strict(),
    question: z.string().trim().min(1).max(2000),
    requestKey: z.uuid(),
    previousId: z.string().max(120).optional(),
    operation: z.enum(["text", "complex"]).default("text"),
  })
  .strict();
export const visionVoices = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;
export const voiceSamples = {
  ru: "Привет! Я Vision, твой AI-наставник. Давай разберём выбранную работу и найдём следующий шаг.",
  kk: "Сәлем! Мен Vision, сенің AI тәлімгеріңмін. Таңдаған жұмысыңды бірге қарап, келесі қадамды анықтайық.",
  en: "Hello! I am Vision, your AI mentor. Let us review your selected work and find a useful next step.",
};
export type VisionCapability = {
  available: boolean;
  granted: boolean;
  revision: number;
  textModel: string;
  complexModel: string;
};
