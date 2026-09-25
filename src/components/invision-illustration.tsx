const descriptions: Record<string, string> = {
  "project-studio":
    "Рисованное учебное пространство: общий стол, эскизы, книги и камера",
  "creative-engineering":
    "Прототип робота с книгами, линейкой и препятствием на испытательном столе",
  "digital-products":
    "Проверка порядка шагов сервиса обмена книгами на бумажном прототипе",
  "digital-media": "Иллюстрация: камера, микрофон и кадры для репортажа",
  sociology:
    "Иллюстрация: диктофон, полевые заметки и материалы для сопоставления свидетельств",
  "public-policy":
    "Иллюстрация общественного учебного центра и материалов для планирования",
};
export function InvisionIllustration({
  asset,
  hero = false,
}: {
  asset: string;
  hero?: boolean;
}) {
  return (
    // Pre-encoded responsive files preserve the full illustrated frame without runtime generation.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`invision-illustration ${hero ? "invision-illustration-hero" : ""}`}
      src={`/images/invision/${asset}-960.webp`}
      srcSet={[480, 960, 1536]
        .map((width) => `/images/invision/${asset}-${width}.webp ${width}w`)
        .join(", ")}
      sizes={
        hero
          ? "(max-width: 1000px) 100vw, 50vw"
          : "(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 33vw"
      }
      width={1536}
      height={1024}
      alt={descriptions[asset] ?? "Практическая работа над проектом"}
      loading={hero ? "eager" : "lazy"}
      fetchPriority={hero ? "high" : "auto"}
      decoding="async"
    />
  );
}
