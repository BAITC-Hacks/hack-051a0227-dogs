"use client";
import { useState } from "react";
import Link from "next/link";
import { Bookmark, Check } from "lucide-react";
import { action } from "@/lib/client";
import { Feedback, useTask } from "./ui";
export function ProgramInterest({
  slug,
  interested,
  authenticated,
}: {
  slug: string;
  interested: boolean;
  authenticated: boolean;
}) {
  const [selected, setSelected] = useState(interested);
  const task = useTask();
  if (!authenticated)
    return (
      <Link href="/login?mode=register" className="button secondary">
        <Bookmark size={17} />
        Сохранить интерес к программе
      </Link>
    );
  return (
    <div>
      <button
        className="button secondary"
        disabled={task.busy}
        onClick={() =>
          task.run(
            async () => {
              await action("interest", { slug, enabled: !selected });
              setSelected(!selected);
            },
            selected
              ? "Направление убрано из интересов."
              : "Направление сохранено в «Моём пути».",
          )
        }
      >
        {selected ? <Check size={17} /> : <Bookmark size={17} />}{" "}
        {selected ? "В моих интересах" : "Сохранить интерес"}
      </button>
      <Feedback task={task} />
    </div>
  );
}
