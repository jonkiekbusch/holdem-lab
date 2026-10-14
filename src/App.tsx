import { useEffect, useState } from "preact/hooks";
import { GamePage } from "./ui/GamePage";
import { WatchPage } from "./ui/WatchPage";
import { parseRoute } from "./ui/route";

export function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const route = parseRoute(hash);
  if (route.path === "/watch") return <WatchPage />;
  // The game keeps running when only the options in the address change, so key it by nothing.
  return <GamePage params={route.params} />;
}
