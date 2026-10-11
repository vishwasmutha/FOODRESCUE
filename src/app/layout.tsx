import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FoodRescue AI", template: "%s · FoodRescue AI" },
  description: "Predict food surplus, match verified recipients, and coordinate accountable rescue pickups across India.",
  applicationName: "FoodRescue AI",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
