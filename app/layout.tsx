import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Forschungsevaluation Matcher",
  description: "Boris-Portal-Exporte gegen Dimensions/GBQ matchen und evaluieren",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
