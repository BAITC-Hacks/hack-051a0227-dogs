export type ProjectState = {
  mission?: import("./missions").Mission;
  screens: string[];
  requiredPhone: boolean;
  headline: string;
  caption: string;
  fragments: string[];
  modules: { kind: string; cell: number }[];
  classifications: Record<string, string>;
  question: string;
  note: string;
  allocations: number[];
  explanation: string;
};
export type ApplicationFields = {
  name: string;
  email: string;
  city: string;
  citizenship: string;
  experience: string;
  personalRole: string;
  motivation: string;
  videoUrl: string;
  most: string;
  least: string;
  processing: boolean;
  research: boolean;
  audioConsent: boolean;
  documentNote: string;
};
export type LanguageState = {
  comprehension: string;
  oralId: string;
  followupId: string;
  writtenNote: string;
};
export type Feedback = {
  checks: { label: string; passed: boolean; detail: string }[];
  summary: string;
  actions: string[];
};
export type SafeUser = import("./avatar").AvatarIdentity & {
  id: string;
  name: string;
  email: string | null;
  role: string;
};
