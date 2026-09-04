"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="state-page" role="alert">
    <h1>Não foi possível abrir esta página</h1>
    <p>{error.message || "Ocorreu uma falha inesperada."}</p>
    <button className="btn btn-secondary" type="button" onClick={reset}>Tentar novamente</button>
  </main>;
}
