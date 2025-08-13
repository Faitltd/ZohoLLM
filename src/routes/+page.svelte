<script lang="ts">
  let term = '';
  let results: any[] = [];
  let selected: { entity: string, name: string } | null = null;

  let question = '';
  let answer = '';
  let sources: string[] = [];
  let sourceDetails: Array<{ module: string; id: string; text: string; meta?: any }> = [];
  let loadingAsk = false;

  let loadingSearch = false;

  let typingTimer: any;
  function onSearchClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    searchNow();
  }

  const DEBOUNCE = 200;

  async function searchNow() {
    if (!term.trim()) { results = []; return; }
    loadingSearch = true;
    try {
      const r = await fetch(`/api/typeahead?term=${encodeURIComponent(term)}`);
      if (r.ok) {
        const data = await r.json();
        results = data.matches || [];
      } else {
        const r2 = await fetch(`/api/search-entity?term=${encodeURIComponent(term)}&k=10`);
        const data2 = await r2.json();
        results = data2.matches || [];
      }
    } catch (err) {
      console.error('searchNow failed', err);
      results = [];
    } finally {
      loadingSearch = false;
    }
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
    sourceDetails = data.sourceDetails || [];
  }
</script>

<section class="container" style="max-width: 760px; margin: 2rem auto;">
  <h1>Client Search</h1>
  <div style="display:flex; gap:.5rem; align-items:center;">
    <input placeholder="Type name, email, phone, address, company…" on:input={onType} bind:value={term} style="flex:1;" />
    <button type="button" on:click={onSearchClick} disabled={loadingSearch} aria-disabled={loadingSearch} style="opacity:{loadingSearch?0.7:1}; cursor:{loadingSearch?'progress':'pointer'};">
      {#if loadingSearch}Searching…{/if}
      {#if !loadingSearch}Search{/if}
    </button>
  </div>
  {#if results.length}
    <h2>Matches</h2>
    <div style="opacity:.7; font-size:.85rem; margin-bottom:.5rem;">{results.length} result{results.length===1?'':'s'}</div>
    {#each results as m}
      <button on:click={() => pick(m)} style="display:block;width:100%;text-align:left;margin:.5rem 0;padding:.75rem;border-radius:.5rem;border:1px solid #333;background:#111;">
        <strong>{m.name || m.email || m.company}</strong>
        <div style="opacity:.8">{m.company} {m.email ? `• ${m.email}` : ''} {m.phone ? `• ${m.phone}` : ''}</div>
        <div style="margin-top:.25rem; display:flex; flex-wrap:wrap; gap:.25rem;">
          {#each Object.entries(m.modules || {}) as [mod, count]}
            <span style="display:inline-flex; align-items:center; gap:.25rem; padding:.1rem .4rem; border-radius:999px; font-size:.72rem; color:#fff; background:{
              mod==='Deals' ? '#2563eb' : mod==='Notes' ? '#16a34a' : mod==='Calls' ? '#f97316' : mod==='Tasks' ? '#7c3aed' : mod==='Contacts' ? '#0891b2' : mod==='Leads' ? '#a16207' : mod==='Projects' ? '#9333ea' : mod==='Emails' ? '#ea580c' : mod==='Meetings' ? '#059669' : mod==='WorkDrive' ? '#475569' : '#6b7280'
            }">
              <span>{mod}</span><span style="opacity:.85">{count}</span>
            </span>
          {/each}
        </div>
        {#if m.hits?.length}
          <div style="opacity:.6;font-size:.85rem">hits: {m.hits.join(', ')}</div>
        {:else if m.reason}
          <div style="opacity:.6;font-size:.85rem">match: {m.reason}</div>
        {/if}
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

      {#if sourceDetails?.length}
        <div class="card" style="border:1px solid #333; border-radius:8px; margin-top:8px;">
          <button type="button" class="card-header" style="width:100%; text-align:left; padding:.5rem .75rem; display:flex; justify-content:space-between; cursor:pointer; background:transparent; border:0;" on:click={(e)=>{const el=(e.currentTarget as HTMLElement).nextElementSibling as HTMLElement; if (el) el.hidden = !el.hidden;}}>
            <strong>Sources ({sourceDetails.length} items)</strong>
            <span style="opacity:.7">toggle</span>
          </button>
          <div class="card-body" style="padding:.5rem .75rem;" hidden>
            {#each sourceDetails as s}
              <div class="src" style="border:1px solid #444; border-radius:6px; padding:.5rem; margin:.5rem 0;">
                <div style="display:flex; align-items:center; gap:.5rem;">
                  <span class="badge" style="background:#0b5; color:#fff; padding:.1rem .4rem; border-radius:999px; font-size:.75rem;">{s.module}</span>
                  <a href={`https://crm.zoho.com/crm/org{import.meta.env.VITE_ZOHO_ORG_ID || '0000000'}/tab/${s.module}/${s.id}`} target="_blank" style="font-size:.85rem;">{s.id}</a>
                  <button on:click={() => navigator.clipboard.writeText(s.text)} style="margin-left:auto; font-size:.75rem;">Copy</button>
                </div>
                <div style="opacity:.85; font-size:.9rem; margin-top:.25rem;">
                  {(s.text || '').slice(0,150)}{(s.text || '').length > 150 ? '...' : ''}
                </div>
                <details style="margin-top:.25rem;">
                  <summary>Show full text</summary>
                  <pre class="whitespace-pre-wrap">{s.text}</pre>
                </details>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  {/if}
</section>
