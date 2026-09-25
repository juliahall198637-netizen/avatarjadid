import { Stage } from "@/components/Stage";

export const dynamic = "force-dynamic";
export const metadata = { title: "حالت کیوسک", robots: { index: false } };

/** Public-terminal variant of the home page: no admin link, fullscreen toggle. */
export default function Kiosk() {
  return <Stage kiosk />;
}
