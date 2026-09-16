import Link from "next/link";
export default function NotFound() {
  return (
    <div className="page wrap">
      <div className="empty">
        <h1>Эту страницу не удалось найти</h1>
        <p style={{ marginTop: 20 }}>
          Проверь ссылку или вернись к своим работам.
        </p>
        <Link className="button primary" href="/my">
          Открыть мой путь
        </Link>
      </div>
    </div>
  );
}
