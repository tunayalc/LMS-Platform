import Link from "next/link";

export default function NotFound() {
  return (
    <main className="card">
      <h1>404</h1>
      <p className="meta">Aradigin sayfa bulunamadi.</p>
      <Link href="/">Login'e don</Link>
    </main>
  );
}
