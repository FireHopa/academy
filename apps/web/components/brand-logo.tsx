type BrandLogoProps = {
  variant?: "mark" | "lockup";
  height?: number;
  className?: string;
  decorative?: boolean;
};

export function BrandLogo({ variant = "lockup", height = 120, className = "", decorative = false }: BrandLogoProps) {
  const lockup = variant === "lockup";
  return <span className={`brand-logo ${className}`.trim()}>
    <img
      src={lockup ? "/brand/casa-do-ads-logo.png" : "/brand/casa-do-ads-mark.png"}
      width={570}
      height={lockup ? 690 : 560}
      style={{ height }}
      alt={decorative ? "" : "Casa do Ads"}
    />
  </span>;
}
