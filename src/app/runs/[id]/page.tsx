import { Suspense } from "react";
import { RunView } from "@/components/run-view";
import { TopBar } from "@/components/ui";

export const metadata = { title: "Ejecución — SYNERG0S" };

export default function RunPage(props: PageProps<"/runs/[id]">) {
  return (
    <>
      <TopBar />
      <Suspense fallback={<p className="label px-6 py-24 text-center">Cargando…</p>}>
        <RunLoader params={props.params} />
      </Suspense>
    </>
  );
}

async function RunLoader({ params }: { params: PageProps<"/runs/[id]">["params"] }) {
  const { id } = await params;
  return <RunView runId={id} />;
}
