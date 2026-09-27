"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { action } from "@/lib/client";
import { scoringActions, type ScoringView } from "@/lib/scoring-contract";
import { AxisProfile } from "./axis-profile";
import { Feedback, Tag, useTask } from "./ui";

export function ScoringPanel({ applicationId, data, onSource, language }: {
  applicationId: string;
  data: ScoringView;
  onSource: (id: string) => void;
  language: string;
}) {
  const router = useRouter();
  const task = useTask();
  const [view, setView] = useState(data);
  const [previousData, setPreviousData] = useState(data);
  const [pollError, setPollError] = useState(false);
  if (previousData !== data) {
    setPreviousData(data);
    setView(data);
  }
  const run = view.runs[0];
  const result = run?.reviews[0]?.result ?? run?.result;
  const preliminary = run?.showcaseScore?.value === undefined
    ? result?.state === "READY" ? "есть основания для следующего шага" : "нужна проверка оснований"
    : run.showcaseScore.value >= 75 ? "сильные эпизоды для обсуждения"
    : run.showcaseScore.value >= 65 ? "есть потенциал для следующего этапа"
    : run.showcaseScore.value >= 55 ? "важно уточнить ключевые основания"
    : "пока недостаточно подтверждений";
  const processing = view.runs.some((item) => ["QUEUED", "RUNNING"].includes(item.status));
  useEffect(() => {
    if (!processing) return;
    let stopped = false;
    const timer = setInterval(() => {
      action<ScoringView>("scoring.status", { applicationId }).then((updated) => {
        if (stopped) return;
        setPollError(false);
        setView(updated);
        if (!updated.runs.some((item) => ["QUEUED", "RUNNING"].includes(item.status))) router.refresh();
      }).catch(() => { if (!stopped) setPollError(true); });
    }, 900);
    return () => { stopped = true; clearInterval(timer); };
  }, [applicationId, processing, router]);

  return (
    <section className="scoring-panel candidate-scoring" id="scoring" aria-label="AI-скоринг">
      <div className="scoring-hero">
        <div className="scoring-heading">
          <h2>AI-скоринг</h2>
          {run && <Tag tone={run.status === "COMPLETED" && run.current ? "blue" : "warning"}>
            {run.status === "COMPLETED" ? run.current ? "Требует проверки" : "Материалы изменились" : run.status === "FAILED" ? "Обработка прервалась" : "Обработка материалов"}
          </Tag>}
        </div>
        {pollError && <p role="alert" className="notice error">Не удалось обновить состояние анализа. Результат пока не подтверждён.</p>}
        {result ? <>
          <div className="candidate-scoring-main">
            <div>
              <h3>Предварительная оценка: {preliminary}</h3>
              <p>{result.summary}</p>
              <p className="candidate-scoring-note">Рекомендация: {scoringActions[result.recommendation.action]}</p>
            </div>
            <div className="candidate-scoring-metrics" aria-label="Баллы">
              <div className="candidate-scoring-metric"><strong>{run.showcaseScore?.value ?? "—"}</strong><span>Общий балл{run.showcaseScore ? " из 100" : " не установлен"}</span></div>
              <div className="candidate-scoring-metric candidate-scoring-english"><span className="metric-label">Английский</span><strong>{run.showcaseEnglishScore?.value ?? "—"}</strong><span>{run.showcaseEnglishScore ? "из 100" : "Балл не установлен"}</span></div>
            </div>
          </div>
          <p className="candidate-scoring-language">Языковой этап: {language}</p>
          {run?.showcaseEssaySignal && <div className="candidate-essay-signal">
            <div><span>AI-анализ эссе</span><strong>{run.showcaseEssaySignal.value}%</strong></div>
            <p>Стилистическое сходство с образцами AI-текста. Показатель не определяет авторство и не влияет на решение.</p>
            <button type="button" className="text-link" onClick={() => onSource(run.showcaseEssaySignal!.sourceId)}>Открыть эссе</button>
          </div>}
        </> : <>
          <p>{run?.status === "FAILED" ? "Анализ не завершился. Повторите запуск, если материалы доступны." : processing ? "Анализ материалов выполняется." : "Предварительная оценка ещё не подготовлена."}</p>
          {!processing && <button type="button" className="button secondary" disabled={task.busy} onClick={() => task.run(async () => {
            await action("scoring.launch", { applicationId });
            setView(await action<ScoringView>("scoring.status", { applicationId }));
            router.refresh();
          })}>Запустить анализ</button>}
        </>}
        <Feedback task={task} />
      </div>
      {run?.status === "COMPLETED" && result && <div id="axis-explanation"><AxisProfile run={run} applicationId={applicationId} onSource={onSource} onUpdated={setView} /></div>}
    </section>
  );
}
