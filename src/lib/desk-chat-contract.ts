import { z } from "zod";
export const deskChatVersion = "vision-desk-dialogue-v1";
export const deskChatRequest = z.object({
  question: z.string().trim().min(1).max(2000),
  applicationIds: z.array(z.string().min(1).max(100)).max(4).default([]),
  sourceId: z.string().max(100).optional(),
  previousId: z.string().max(100).optional(),
  requestKey: z.uuid(),
});
export const deskChatOutput = z
  .object({
    paragraphs: z
      .array(
        z
          .object({
            text: z.string().min(1).max(1800),
            evidenceKeys: z.array(z.string()).max(8),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    evidence: z
      .array(
        z
          .object({ key: z.string(), quote: z.string().min(1).max(1000) })
          .strict(),
      )
      .max(12),
    question: z
      .object({
        applicationId: z.string(),
        sourceKeys: z.array(z.string()).min(1).max(5),
        text: z.string().min(15).max(2000),
      })
      .strict()
      .nullable(),
    interview: z
      .array(
        z
          .object({
            applicationId: z.string(),
            sourceKey: z.string(),
            section: z.enum([
              "action",
              "thinking",
              "outcome",
              "learning",
              "application",
            ]),
            text: z.string().min(10).max(800),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();
export type DeskChatOutput = z.infer<typeof deskChatOutput>;
export type DeskChatEvidence = {
  key: string;
  quote: string;
  title: string;
  origin: string;
  version: string;
  applicationId: string;
  sourceId: string;
};
export type DeskChatTurn = {
  id: string;
  question: string;
  createdAt: string;
  unavailable: boolean;
  status: string;
  answer: (DeskChatOutput & { sources: DeskChatEvidence[] }) | null;
};
