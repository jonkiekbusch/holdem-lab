import { useEffect, useState } from "preact/hooks";
import { WatchPage } from "./ui/WatchPage";

function currentRoute(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}

export function App() {
  const [route, setRoute] = useState(currentRoute());
  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  if (route === "/watch") return <WatchPage />;

  return (
    <main class="screen">
      <header class="topbar">
        <h1 class="app-name">{__APP_NAME__}</h1>
        <a class="top-link" href="#/watch">
          Watch the bots play
        </a>
      </header>
      <section class="table-area" aria-label="Poker table">
        <div class="table" data-testid="table">
          <p class="table-note">Table coming soon</p>
        </div>
      </section>
    </main>
  );
}
