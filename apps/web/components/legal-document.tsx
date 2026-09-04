import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "./brand-logo";
import styles from "./legal-document.module.css";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

type LegalDocumentProps = {
  label: string;
  title: string;
  summary: string;
  version: string;
  updatedAt: string;
  notice?: ReactNode;
  sections: LegalSection[];
};

export function LegalDocument({ label, title, summary, version, updatedAt, notice, sections }: LegalDocumentProps) {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" aria-label="Ir para o início">
          <BrandLogo className={styles.logo} height={52} />
        </Link>
        <nav className={styles.toplinks} aria-label="Navegação pública">
          <Link href="/termos">Termos</Link>
          <Link href="/privacidade">Privacidade</Link>
          <Link className={styles.loginLink} href="/login">Entrar</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>{label}</p>
        <h1>{title}</h1>
        <p className={styles.summary}>{summary}</p>
        <div className={styles.meta}>
          <span>Versão {version}</span>
          <span>Atualizado em {updatedAt}</span>
          <span>Academy Play · Casa do Ads</span>
        </div>
      </section>

      <div className={styles.layout}>
        <aside className={styles.toc}>
          <strong>Neste documento</strong>
          <nav aria-label="Índice do documento">
            {sections.map((section, index) => (
              <a key={section.id} href={`#${section.id}`}>{index + 1}. {section.title}</a>
            ))}
          </nav>
        </aside>

        <article className={styles.content}>
          {notice ? <div className={styles.notice}>{notice}</div> : null}
          {sections.map(section => (
            <section className={styles.section} id={section.id} key={section.id}>
              <h2>{section.title}</h2>
              {section.content}
            </section>
          ))}
        </article>
      </div>

      <footer className={styles.footer}>
        <div>
          <strong>Casa do Ads</strong><br />
          CNPJ 27.921.309/0001-70<br />
          Rua Santa Cruz, 541, 1º andar, Vila Mariana, São Paulo/SP
        </div>
        <nav className={styles.footerLinks} aria-label="Documentos e contato">
          <Link href="/termos">Termos de Uso</Link>
          <Link href="/privacidade">Política de Privacidade</Link>
          <a href="mailto:contato@casadoads.com.br">contato@casadoads.com.br</a>
        </nav>
      </footer>
    </main>
  );
}
