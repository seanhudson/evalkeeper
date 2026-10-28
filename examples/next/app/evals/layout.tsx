import { AppComponents } from "@/lib/evalkeeper/appComponents";

/** Every eval page, drawn with the app's own components. */
export default function EvalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppComponents>{children}</AppComponents>;
}
