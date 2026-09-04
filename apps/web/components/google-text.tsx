import { Fragment } from "react";
import styles from "./google-text.module.css";

const colors = [styles.blue, styles.red, styles.yellow, styles.blue, styles.green, styles.red];

export function GoogleWord({ value = "Google" }: { value?: string }) {
  return <span className={styles.word}>
    <span className={styles.srOnly}>{value}</span>
    <span aria-hidden="true">{Array.from(value).map((letter, index) => <span className={`${styles.letter} ${colors[index % colors.length]}`} key={`${letter}-${index}`}>{letter}</span>)}</span>
  </span>;
}

export function GoogleText({ children }: { children?: string | null }) {
  if (!children) return null;
  return <>{children.split(/(google)/gi).map((part, index) => /^google$/i.test(part) ? <GoogleWord value={part} key={index}/> : <Fragment key={index}>{part}</Fragment>)}</>;
}
