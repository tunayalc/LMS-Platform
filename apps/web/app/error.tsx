"use client";

import Link from "next/link";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <main className="card">
      <h1>Beklenmeyen Hata</h1>
      <p className="meta">Bir hata olustu. Tekrar deneyebilirsin.</p>
      <p className="meta">Detay: {error.message}</p>
      <button className="btn" type="button" onClick={() => reset()}>
        Tekrar Dene
      </button>
      <div style={{ marginTop: 12 }}>
        <Link href="/">Login'e don</Link>
      </div>
    </main>
  );
}
