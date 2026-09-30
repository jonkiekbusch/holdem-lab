export function App() {
  return (
    <main class="screen">
      <header class="topbar">
        <h1 class="app-name">{__APP_NAME__}</h1>
      </header>
      <section class="table-area" aria-label="Poker table">
        <div class="table" data-testid="table">
          <p class="table-note">Table coming soon</p>
        </div>
      </section>
    </main>
  );
}
