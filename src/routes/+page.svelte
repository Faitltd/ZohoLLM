<script lang="ts">
  let entity = 'lead_123';
  let message = 'What do we know about this entity?';
  let topK = 5;

  let loading = false;
  let error: string | null = null;
  let result: any = null;

  async function onSubmit(e: Event) {
    e.preventDefault();
    loading = true;
    error = null;
    result = null;

    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, entity, topK })
      });
      const data = await r.json();
      if (!r.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${r.status}`);
      }
      result = data;
    } catch (e: any) {
      error = e?.message || String(e);
    } finally {
      loading = false;
    }
  }
</script>

<section style="max-width: 720px; margin: 2rem auto; font-family: ui-sans-serif, system-ui;">
  <h1 style="font-size: 1.4rem; font-weight: 600; margin-bottom: 1rem;">Zoho LLM — Quick Chat</h1>

  <form on:submit={onSubmit} style="display: grid; gap: 0.75rem;">
    <label>
      <div style="font-size: 0.9rem;">Entity ID</div>
      <input bind:value={entity} placeholder="e.g. lead_123"
             style="width: 100%; padding: 0.6rem; border: 1px solid #ddd; border-radius: 8px;" />
    </label>

    <label>
      <div style="font-size: 0.9rem;">Message</div>
      <textarea bind:value={message} rows="3"
                style="width: 100%; padding: 0.6rem; border: 1px solid #ddd; border-radius: 8px;"></textarea>
    </label>

    <label>
      <div style="font-size: 0.9rem;">Top K</div>
      <input type="number" bind:value={topK} min="1" max="20"
             style="width: 100%; padding: 0.6rem; border: 1px solid #ddd; border-radius: 8px;" />
    </label>

    <button type="submit" disabled={loading}
            style="padding: 0.7rem 1rem; border: none; border-radius: 8px; background: black; color: white; cursor: pointer;">
      {loading ? 'Asking…' : 'Ask'}
    </button>
  </form>

  {#if error}
    <p style="margin-top: 1rem; color: #b00020;">{error}</p>
  {/if}

  {#if result}
    <div style="margin-top: 1.25rem;">
      <h2 style="font-size: 1.1rem; font-weight: 600;">Results</h2>
      {#if result.documents?.length === 0}
        <p>No results.</p>
      {:else}
        <ol style="display: grid; gap: 0.75rem; padding-left: 1.25rem;">
          {#each result.documents as doc, i}
            <li>
              <div style="font-size: 0.9rem; white-space: pre-wrap;">{doc}</div>
              <div style="font-size: 0.8rem; color: #555; margin-top: 0.25rem;">
                id: {result.ids?.[i] ?? '—'}
                &nbsp;·&nbsp; distance: {result.distances?.[i]?.toFixed?.(4) ?? '—'}
              </div>
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  {/if}
</section>
