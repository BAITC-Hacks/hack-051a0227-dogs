import {
  ScanSearch,
  UsersRound,
  FlaskConical,
  Scale,
  Flag,
} from "lucide-react";
export function SkillMark({ branch }: { branch: string }) {
  const Icon =
    (
      {
        understand: ScanSearch,
        people: UsersRound,
        ideas: FlaskConical,
        decide: Scale,
        finish: Flag,
      } as const
    )[branch as "understand"] ?? ScanSearch;
  return (
    <span className={`skill-mark skill-${branch}`}>
      <Icon size={24} strokeWidth={1.7} />
    </span>
  );
}
