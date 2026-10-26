import { AlertTriangle, RefreshCw } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Button } from "./ui";

// Shown above every page when the shop's data could not be loaded, so an empty screen is never
// mistaken for lost data. The server's health page names the exact cause.
const MESSAGES = {
  unreachable: {
    title: "The shop's data could not be loaded",
    body: 'The server did not send the data. Check that the black "Al-Syed server" window is open and that this computer is online.',
  },
  empty: {
    title: "The server sent no data at all",
    body: "No products, bills or customers were found. If this shop already has data, backend\\.env on this computer points to the wrong Supabase project or holds the wrong key.",
  },
};

const DataProblemBanner = () => {
  const { dataProblem } = useApp();
  const msg = MESSAGES[dataProblem];
  if (!msg) return null;
  return (
    <div role="alert" className="mx-4 sm:mx-6 lg:mx-8 mt-4 rounded-xl border border-khata-200 bg-khata-50 p-4 text-sm text-khata-700 print:hidden">
      <div className="flex flex-wrap items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{msg.title}</p>
          <p className="mt-0.5">{msg.body}</p>
          <p className="mt-1">
            Details:{" "}
            <a href="/api/health" target="_blank" rel="noreferrer" className="underline font-medium">
              server health check
            </a>
          </p>
        </div>
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    </div>
  );
};

export default DataProblemBanner;
