type ErrorProps = {
  statusCode?: number;
};

export default function ErrorPage({ statusCode }: ErrorProps) {
  return (
    <main style={{ padding: 24 }}>
      <h1>Bir hata olustu</h1>
      <p>Durum: {statusCode ?? "Bilinmiyor"}</p>
      <a href="/">Login'e don</a>
    </main>
  );
}

ErrorPage.getInitialProps = ({
  res,
  err
}: {
  res?: { statusCode?: number };
  err?: { statusCode?: number };
}) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 500;
  return { statusCode };
};
