<script lang="ts">
  import { onMount } from 'svelte';
  let term = '';
  let results: any[] = [];
  let selected: { entity: string, name: string } | null = null;

  let question = '';
  let answer = '';
  let sources: string[] = [];
  let loadingAsk = false;

  let typingTimer: any;
  const DEBOUNCE = 200;

  async function searchNow() {
    if (!term.trim()) { results = []; return; }
    const r = await fetch(`/api/typeahead?term=${encodeURIComponent(term)}`);
    const data = await r.json();
    results = data.matches || [];
  }

  function onType(e: any) {
    term = e.target.value;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(searchNow, DEBOUNCE);
  }

  function pick(m: any) {
    selected = { entity: m.entity, name: m.name || m.email || m.company || m.entity };
    answer = ''; sources = [];
  }

  async function ask() {
    if (!selected || !question.trim()) return;
    loadingAsk = true;
    answer = ''; sources = [];
    const r = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entity: selected.entity, question })
    });
    const data = await r.json();
    loadingAsk = false;
    answer = data.answer || data.message || '(no answer)';
    sources = data.sources || [];
  }
</script>

<section class="container" style="max-width: 760px; margin: 2rem auto;">
  <h1>Client Search</h1>
  <input placeholder="Type name, email, phone, address, company…" on:input={onType} value={term} />
  {#if results.length}
    <h2>Matches</h2>
    {#each results as m}
      <button on:click={() => pick(m)} style="display:block;width:100%;text-align:left;margin:.5rem 0;padding:.75rem;border-radius:.5rem;border:1px solid #333;background:#111;">
        <strong>{m.name || m.email || m.company}</strong>
        <div style="opacity:.8">{m.company} {m.email ? `• ${m.email}` : ''} {m.phone ? `• ${m.phone}` : ''}</div>
        <div style="opacity:.6;font-size:.85rem">hits: {m.hits.join(', ')}</div>
      </button>
    {/each}
  {/if}

  {#if selected}
    <h2>Ask about {selected.name}</h2>
    <div style="display:flex;gap:.5rem;">
      <input placeholder="e.g., what is the contract amount? show recent notes; list files" bind:value={question} />
      <button on:click={ask} disabled={loadingAsk}>{loadingAsk ? 'Asking…' : 'Ask'}</button>
    </div>
    {#if answer}
      <h3>Answer</h3>
      <pre>{answer}</pre>
      {#if sources?.length}
        <details>
          <summary>Sources</summary>
          <ul>{#each sources as s}<li>{s}</li>{/each}</ul>
        </details>
      {/if}
    {/if}
  {/if}
</section>
