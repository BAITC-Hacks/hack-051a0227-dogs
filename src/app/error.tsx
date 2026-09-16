"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page wrap">
      <div className="empty">
        <h1>Загрузка прервалась</h1>
        <p style={{ marginTop: 20 }}>
          Сохранённая работа остаётся на сервере. Попробуй открыть страницу
          снова.
        </p>
        <button className="button primary" onClick={reset}>
          Повторить
        </button>
      </div>
    </div>
  );
}
