<script lang="ts">
  let term = '';
  let searching = false;
  let matches: Array<{ entity: string; name: string; company?: string; email?: string; phone?: string }> = [];

  let loadingChat = false;
  let chatDocs: Array<{ text: string; meta?: any }> = [];
  let selectedEntity = '';

  async function doSearch(e: Event) {
    e.preventDefault();
    searching = true;
    matches = [];
    chatDocs = [];
    selectedEntity = '';
    try {
      const r = await fetch(`/api/search-entity?term=${encodeURIComponent(term)}&k=12`);
      const j = await r.json();
      matches = j.matches || [];
    } finally {
      searching = false;
    }
  }

  async function openChat(entity: string) {
    selectedEntity = entity;
    loadingChat = true;
    chatDocs = [];
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entity,
          message: 'Summarize everything we know about this person (deals, notes, projects, tasks, calls, workdrive).',
          topK: 8
        })
      });
      const j = await r.json();
      const docs = (j.documents || []) as string[];
      const metas = (j.metadatas || []) as any[];
      chatDocs = docs.map((text, i) => ({ text, meta: metas?.[i] }));
    } finally {
      loadingChat = false;
    }
  }
</script>

<section class="container" style="max-width: 760px; margin: 2rem auto;">
  <h1>Client Search</h1>
  <form on:submit|preventDefault={doSearch} style="display:flex; gap:.5rem;">
    <input
      placeholder="Search by first/last name, address, or phone"
      bind:value={term}
      required
      style="flex:1; padding:.6rem; border:1px solid #ddd; border-radius:8px;"
    />
    <button
      type="submit"
      disabled={searching}
      style="padding:.6rem 1rem; border:0; border-radius:8px; background:#111; color:white;"
    >
      {searching ? 'Searching…' : 'Search'}
    </button>
  </form>

  {#if matches.length}
    <h2 style="margin-top:1rem;">Matches</h2>
    <ul style="list-style:none; padding:0; margin:0;">
      {#each matches as m}
        <li>
          <button type="button" on:click={() => openChat(m.entity)}
            style="width:100%; text-align:left; padding:.75rem; border:1px solid #eee; border-radius:8px; margin:.5rem 0; background:white; cursor:pointer;">
            <div style="font-weight:600;">{m.name}</div>
            <div style="font-size:.9rem; color:#555;">
              {m.company || ''} {m.email ? ` • ${m.email}` : ''} {m.phone ? ` • ${m.phone}` : ''}
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if selectedEntity}
    <h2 style="margin-top:1.5rem;">Context for {selectedEntity}</h2>
    {#if loadingChat}
      <div>Loading context…</div>
    {:else if chatDocs.length === 0}
      <div>No documents found.</div>
    {:else}
      <div style="display:grid; gap:.75rem;">
        {#each chatDocs as d}
          <article style="border:1px solid #eee; border-radius:8px; padding:.75rem;">
            <pre style="white-space:pre-wrap; margin:0;">{d.text}</pre>
            {#if d.meta}
              <div style="font-size:.8rem; color:#666; margin-top:.25rem;">
                {d.meta.module ? `Module: ${d.meta.module} • ` : ''}{d.meta.id ? `ID: ${d.meta.id}` : ''}
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  {/if}
</section>
