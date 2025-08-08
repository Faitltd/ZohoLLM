<script>
  export let data;
</script>

<nav>
  <a href="/">Chat</a>
  <a href="/dashboard">Dashboard</a>
  <a href="/webhooks">Webhooks</a>
</nav>

<slot />

<style>
  nav { display: flex; gap: 16px; padding: 12px 16px; background: #0f172a; }
  nav a { color: #e2e8f0; text-decoration: none; font-weight: 600; }
  nav a:hover { color: white; }
  :global(main) { max-width: 1000px; margin: 16px auto; padding: 0 16px; }
</style>

