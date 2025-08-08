<script lang="ts">
  import { onMount } from 'svelte';

  type WebhookEvent = {
    module: string;
    recordId: string;
    entityId: string;
    timestamp: string;
  };

  let events: WebhookEvent[] = [];
  let loading: boolean = true;

  onMount(async () => {
    const res = await fetch('/api/webhook-log');
    const data = await res.json();
    events = (data?.events ?? []) as WebhookEvent[];
    loading = false;
  });
</script>

<main>
  <h1>Webhook Monitor</h1>
  {#if loading}
    <p>Loading...</p>
  {:else}
    <table>
      <thead>
        <tr><th>Time</th><th>Module</th><th>Record</th><th>Entity</th></tr>
      </thead>
      <tbody>
        {#each events as e}
          <tr>
            <td>{new Date(e.timestamp).toLocaleString()}</td>
            <td>{e.module}</td>
            <td>{e.recordId}</td>
            <td>{e.entityId}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</main>

<style>
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 8px; border-bottom: 1px solid #eee; }
  th { text-align: left; }
</style>

