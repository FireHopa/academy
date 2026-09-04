import { ReactNode } from "react";

type AccountSection = "overview" | "profile" | "security" | "certificates";
type AccountLayoutProps = {
  active: AccountSection;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function AccountLayout({ active, eyebrow, title, description, children }: AccountLayoutProps) {
  void active;
  return <div className="account-workspace">
    <header className="account-workspace-head">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
    {children}
  </div>;
}
