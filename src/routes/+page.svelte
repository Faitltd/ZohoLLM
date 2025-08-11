<script lang="ts">
  let term = '';
  let searching = false;
  let matches: Array<{ entity: string; name: string; company?: string; email?: string; phone?: string }> = [];

  let loadingChat = false;
  let chatDocs: Array<{ text: string; meta?: any }> = [];
  let selectedEntity = '';
  let selected: any = null;     // set when clicking a match
  let question = "";
  let answer = "";
  let sources: Array<{ id: string; meta: any; text: string }> = [];

  async function ask() {
    if (!selected?.entity || !question) return;
    answer = "";
    sources = [];
    const r = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entity: selected.entity, question, topK: 6 })
    });
    const j = await r.json();
    answer = j.answer || j.error || "(no answer)";
    sources = j.sources || [];
  }

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
    selected = { entity };
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

    <!-- Chat box -->
    <div class="mt-4 p-3 rounded border">
      <form on:submit|preventDefault={ask}>
        <input
          class="w-full p-2 border rounded"
          placeholder="Ask a question about this client…"
          bind:value={question}
        />
        <button class="mt-2 px-3 py-1 rounded border" disabled={!question}>
          Ask
        </button>
      </form>

      {#if answer}
        <div class="mt-4">
          <h3 class="font-semibold mb-1">Answer</h3>
          <p class="leading-relaxed whitespace-pre-wrap">{answer}</p>

          <details class="mt-3">
            <summary>Sources</summary>
            <ol class="list-decimal ml-5 mt-2 space-y-2">
              {#each sources as s, i}
                <li>
                  <div class="text-xs opacity-80">
                    <b>ID:</b> {s.id}
                    {#if s.meta?.Module} • <b>Module:</b> {s.meta.Module}{/if}
                    {#if s.meta?.Stage} • <b>Stage:</b> {s.meta.Stage}{/if}
                  </div>
                  <pre class="whitespace-pre-wrap text-sm mt-1">{s.text}</pre>
                </li>
              {/each}
            </ol>
          </details>
        </div>
      {/if}
    </div>

    <h2 style="margin-top:1.5rem;">Context for {selectedEntity}</h2>
    {#if loadingChat}
      <div>Loading context…</div>
    {:else if chatDocs.length === 0}
      <div>No documents found.</div>
    {:else}
      <div style="display:grid; gap:.75rem;">
        {#each chatDocs as d}
          <article style="border:1px solid #eee; border-radius:8px; padding:.75rem;">
            {#if d.meta}
              <p class="mt-2 text-sm" style="opacity:0.8; margin:0.25rem 0 0;">
                <strong>Module:</strong> {d.meta?.Module ?? d.meta?.module ?? '—'}
                {#if d.meta?.Stage} • <strong>Stage:</strong> {d.meta.Stage}{/if}
                {#if d.meta?.Amount} • <strong>Amount:</strong> {d.meta.Amount}{/if}
                {#if d.meta?.id} • <strong>ID:</strong> {d.meta.id}{/if}
              </p>
            {/if}
            <pre class="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style="margin:0;">{d.text}</pre>
          </article>
        {/each}
      </div>
    {/if}
  {/if}
</section>
